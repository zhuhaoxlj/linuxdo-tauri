mod api;
mod audio;
mod auth;
mod lan;
mod reminders;
mod shared_storage;
mod site_session;

use auth::PendingLogin;
use serde_json::Value;
use shared_storage::SharedStorageLock;
use site_session::{SessionTask, SiteReply, SiteSession};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter,
};
use tauri::{Manager, State};
use tauri_plugin_deep_link::DeepLinkExt;

#[derive(Default)]
struct AppState {
    pending_login: Mutex<Option<PendingLogin>>,
    authenticated: AtomicBool,
}

#[tauri::command]
async fn start_oauth_flow(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    #[cfg(any(target_os = "linux", target_os = "windows"))]
    app.deep_link()
        .register_all()
        .map_err(|_| "无法注册浏览器回调，请检查应用安装")?;
    let login = tauri::async_runtime::spawn_blocking(PendingLogin::new)
        .await
        .map_err(|_| "生成登录密钥失败，请重试")??;
    let url = login.authorization_url()?;
    *state.pending_login.lock().unwrap() = Some(login);
    if tauri_plugin_opener::open_url(url.as_str(), None::<&str>).is_err() {
        state.pending_login.lock().unwrap().take();
        return Err("打开浏览器失败，请检查默认浏览器设置".into());
    }
    Ok(())
}

#[tauri::command]
fn cancel_login(state: State<'_, AppState>) {
    state.pending_login.lock().unwrap().take();
}

#[tauri::command]
async fn handle_auth_callback(
    url: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    session: State<'_, SiteSession>,
) -> Result<Value, String> {
    let credentials = {
        let mut pending = state.pending_login.lock().unwrap();
        let credentials = pending
            .as_ref()
            .ok_or("登录请求已失效，请重新点击浏览器登录")?
            .decode_callback(&url)?;
        pending.take();
        credentials
    };
    let user = session
        .request(
            &app,
            SessionTask::Login {
                otp: credentials.otp,
                api_key: credentials.api_key,
            },
        )
        .await?;
    if user["username"].as_str().is_none_or(str::is_empty) {
        return Err("登录会话未建立，请重新授权".into());
    }
    state.authenticated.store(true, Ordering::SeqCst);
    Ok(user)
}

#[tauri::command]
async fn restore_session(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    session: State<'_, SiteSession>,
) -> Result<Option<Value>, String> {
    if !SiteSession::has_session(&app)? {
        return Ok(None);
    }
    let user = session.request(&app, SessionTask::CurrentUser).await?;
    if user["username"]
        .as_str()
        .is_some_and(|name| !name.is_empty())
    {
        state.authenticated.store(true, Ordering::SeqCst);
        Ok(Some(user))
    } else {
        SiteSession::clear_session(&app)?;
        state.authenticated.store(false, Ordering::SeqCst);
        Ok(None)
    }
}

#[tauri::command]
async fn logout(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    session: State<'_, SiteSession>,
) -> Result<(), String> {
    session.cancel("已退出登录");
    SiteSession::clear_session(&app)?;
    state.authenticated.store(false, Ordering::SeqCst);
    state.pending_login.lock().unwrap().take();
    Ok(())
}

#[tauri::command]
async fn discourse_request(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    session: State<'_, SiteSession>,
    path: String,
    method: String,
    body: Option<Value>,
) -> Result<Value, String> {
    api::validate_request(&path, &method)?;
    if method != "GET" && !state.authenticated.load(Ordering::SeqCst) {
        return Err("请先登录后再操作".into());
    }
    session
        .request(&app, SessionTask::Api { path, method, body })
        .await
}

#[tauri::command]
async fn fetch_forum_image(
    app: tauri::AppHandle,
    session: State<'_, SiteSession>,
    url: String,
) -> Result<Value, String> {
    // 只代理论坛自身资源：主窗口的 <img> 跨站不带 SameSite cookie，受限图片会 403，
    // 由 linux.do 同源的会话窗口带会话重新拉取。
    let host = url::Url::parse(&url)
        .ok()
        .and_then(|parsed| parsed.host_str().map(|host| host.to_string()))
        .ok_or("图片地址无效")?;
    if host != "linux.do" {
        return Err("不支持的图片地址".into());
    }
    session.request(&app, SessionTask::FetchImage { url }).await
}

#[tauri::command]
fn site_ready(
    window: tauri::WebviewWindow,
    session: State<'_, SiteSession>,
    challenge: bool,
) -> Result<(), String> {
    session.page_ready(&window, challenge)
}

#[tauri::command]
async fn upload_file(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    session: State<'_, SiteSession>,
    file_name: String,
    content_type: String,
    data: String,
) -> Result<Value, String> {
    if !state.authenticated.load(Ordering::SeqCst) {
        return Err("请先登录后上传附件".into());
    }
    if data.len() > 40 * 1024 * 1024 {
        return Err("单个附件不能超过 30 MB".into());
    }
    if file_name.is_empty() || file_name.contains(['/', '\\']) || content_type.len() > 128 {
        return Err("附件信息无效".into());
    }
    session
        .request(
            &app,
            SessionTask::Upload {
                file_name,
                content_type,
                data,
            },
        )
        .await
}

#[tauri::command]
fn site_response(
    window: tauri::WebviewWindow,
    session: State<'_, SiteSession>,
    id: String,
    reply: SiteReply,
) -> Result<(), String> {
    session.receive(&window, &id, reply)
}

#[cfg(desktop)]
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // Must be first: the callback instance forwards its URL to the process holding the RSA key.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }));
    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/128x128.png"))?;
                if let Some(window) = app.get_webview_window("main") {
                    window.set_icon(icon.clone())?;
                }
                let open = MenuItem::with_id(app, "open", "打开 LinuxDo", true, None::<&str>)?;
                let status = MenuItem::with_id(
                    app,
                    "reminder-status",
                    "提醒状态：正常",
                    false,
                    None::<&str>,
                )?;
                let quit = MenuItem::with_id(app, "quit", "退出 LinuxDo", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&open, &status, &quit])?;
                match TrayIconBuilder::new()
                    .icon(icon)
                    .tooltip("LinuxDo · 后台提醒")
                    .menu(&menu)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "open" => show_main_window(app),
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if matches!(
                            event,
                            TrayIconEvent::Click {
                                button: MouseButton::Left,
                                button_state: MouseButtonState::Up,
                                ..
                            }
                        ) {
                            show_main_window(tray.app_handle());
                        }
                    })
                    .build(app)
                {
                    Ok(_) => {
                        let runtime = app.state::<Arc<reminders::ReminderRuntime>>();
                        *runtime.status_item.lock().unwrap() = Some(status);
                        runtime.tray_ready.store(true, Ordering::SeqCst);
                    }
                    Err(error) => {
                        app.state::<Arc<reminders::ReminderRuntime>>()
                            .update_status(Some(format!("系统托盘不可用：{error}")));
                    }
                }
                #[cfg(target_os = "linux")]
                if let Err(error) = notify_rust::get_server_information() {
                    app.state::<Arc<reminders::ReminderRuntime>>()
                        .update_status(Some(format!("系统通知服务不可用：{error}")));
                }
                reminders::start(
                    app.handle().clone(),
                    app.state::<Arc<reminders::ReminderRuntime>>()
                        .inner()
                        .clone(),
                );
            }
            // 局域网发现 + 握手验证：全平台启动，不依赖托盘
            lan::start(
                app.handle().clone(),
                app.state::<Arc<lan::LanRuntime>>().inner().clone(),
            );
            Ok(())
        })
        .manage(AppState::default())
        .manage(SiteSession::default())
        .manage(SharedStorageLock::default())
        .manage(Arc::new(reminders::ReminderRuntime::default()))
        .manage(Arc::new(lan::LanRuntime::default()))
        .manage(Arc::new(audio::AudioRuntime::default()))
        .on_window_event(|window, event| {
            #[cfg(desktop)]
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let runtime = window
                        .app_handle()
                        .state::<Arc<reminders::ReminderRuntime>>();
                    if runtime.tray_ready.load(Ordering::SeqCst) {
                        if !runtime.tray_announced.load(Ordering::SeqCst) {
                            if let Err(error) =
                                reminders::announce_background(window.app_handle(), &runtime)
                            {
                                runtime.update_status(Some(error));
                                let _ = window.emit(
                                    "tray-unavailable",
                                    "系统通知不可用，请检查通知服务后重试",
                                );
                                return;
                            }
                            runtime.tray_announced.store(true, Ordering::SeqCst);
                        }
                        let _ = window.hide();
                    } else {
                        let _ = window.emit(
                            "tray-unavailable",
                            "系统托盘不可用，请保持窗口打开以接收提醒",
                        );
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            start_oauth_flow,
            cancel_login,
            handle_auth_callback,
            restore_session,
            logout,
            discourse_request,
            fetch_forum_image,
            upload_file,
            site_ready,
            site_response,
            shared_storage::shared_storage_load,
            shared_storage::shared_storage_save,
            shared_storage::shared_storage_put,
            shared_storage::shared_storage_backup,
            reminders::reminder_status,
            reminders::take_reminder_open,
            lan::lan_status,
            audio::audio_status,
            audio::audio_start,
            audio::audio_stop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

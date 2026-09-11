mod api;
mod auth;
mod site_session;

use auth::PendingLogin;
use serde_json::Value;
use site_session::{SessionTask, SiteReply, SiteSession};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
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
        .plugin(tauri_plugin_deep_link::init())
        .manage(AppState::default())
        .manage(SiteSession::default())
        .on_window_event(|window, event| {
            if window.label() == "main"
                && matches!(event, tauri::WindowEvent::CloseRequested { .. })
            {
                window.app_handle().exit(0);
            }
        })
        .invoke_handler(tauri::generate_handler![
            start_oauth_flow,
            cancel_login,
            handle_auth_callback,
            restore_session,
            logout,
            discourse_request,
            upload_file,
            site_ready,
            site_response,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

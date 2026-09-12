use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use std::time::Duration;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tokio::sync::oneshot;

use crate::auth::DISCOURSE_URL;

const WINDOW_LABEL: &str = "site-session";
const SESSION_PAGE: &str = "https://linux.do/";

#[derive(Serialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum SessionTask {
    Login {
        otp: String,
        api_key: String,
    },
    CurrentUser,
    FetchImage {
        url: String,
    },
    Api {
        path: String,
        method: String,
        body: Option<Value>,
    },
    Upload {
        file_name: String,
        content_type: String,
        data: String,
    },
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SiteReply {
    Success { data: Value },
    Challenge,
    Error { message: String },
}

struct PendingRequest {
    script: String,
    dispatched: bool,
    sender: oneshot::Sender<Result<Value, String>>,
}

#[derive(Default)]
pub struct SiteSession {
    window_creation: tokio::sync::Mutex<()>,
    pending: Mutex<HashMap<String, PendingRequest>>,
    ready: AtomicBool,
}

impl SiteSession {
    pub async fn request(&self, app: &AppHandle, task: SessionTask) -> Result<Value, String> {
        // 登录可能需要用户在验证窗口手动完成人机验证并等待页面重载，预算放宽；
        // 图片代理按原图体积放宽；其余请求保持短预算，避免坏掉或被墙的 WebView 把前端挂在加载态。
        let budget = match task {
            SessionTask::Login { .. } => Duration::from_secs(150),
            SessionTask::FetchImage { .. } => Duration::from_secs(45),
            _ => Duration::from_secs(30),
        };
        let id = uuid::Uuid::new_v4().to_string();
        let payload = serde_json::json!({ "id": id, "task": &task });
        let (sender, receiver) = oneshot::channel();
        self.pending.lock().unwrap().insert(
            id.clone(),
            PendingRequest {
                script: format!("window.__linuxdoSession({payload})"),
                dispatched: false,
                sender,
            },
        );
        {
            let _creation = self.window_creation.lock().await;
            if let Err(error) = self
                .ensure_window(app)
                .and_then(|window| self.dispatch(&window))
            {
                self.cancel(&error);
            }
        }
        // A broken or blocked WebView must not leave the frontend in its loading state forever.
        let result = tokio::time::timeout(budget, receiver).await;
        let empty = {
            let mut pending = self.pending.lock().unwrap();
            pending.remove(&id);
            pending.is_empty()
        };
        if empty && self.ready.load(Ordering::SeqCst) {
            if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
                let _ = window.hide();
            }
        }
        match result {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err("登录会话请求已取消，请重试".into()),
            Err(_) => Err("网站验证超时，请重新登录并完成验证窗口中的操作".into()),
        }
    }

    fn ensure_window(&self, app: &AppHandle) -> Result<WebviewWindow, String> {
        if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
            return Ok(window);
        }
        self.ready.store(false, Ordering::SeqCst);
        let window = WebviewWindowBuilder::new(
            app,
            WINDOW_LABEL,
            WebviewUrl::External(SESSION_PAGE.parse().unwrap()),
        )
        .title("Linux.do 网站验证")
        .inner_size(720.0, 640.0)
        .visible(false)
        .initialization_script(include_str!("site_session.js"))
        .on_page_load(|webview, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Started {
                webview
                    .app_handle()
                    .state::<SiteSession>()
                    .ready
                    .store(false, Ordering::SeqCst);
            }
        })
        .build()
        .map_err(|_| "无法打开网站验证窗口，请重试".to_string())?;
        let handle = window.clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                handle
                    .app_handle()
                    .state::<SiteSession>()
                    .cancel("已取消网站验证，请重试");
                let _ = handle.hide();
            }
        });
        Ok(window)
    }

    fn dispatch(&self, window: &WebviewWindow) -> Result<(), String> {
        if !self.ready.load(Ordering::SeqCst) {
            return Ok(());
        }
        Self::validate_sender(window)?;
        let scripts = {
            let mut pending = self.pending.lock().unwrap();
            pending
                .iter_mut()
                .filter_map(|(id, request)| {
                    if request.dispatched {
                        return None;
                    }
                    request.dispatched = true;
                    Some((id.clone(), request.script.clone()))
                })
                .collect::<Vec<_>>()
        };
        for (id, script) in scripts {
            if window.eval(&script).is_err() {
                if let Some(request) = self.pending.lock().unwrap().remove(&id) {
                    let _ = request
                        .sender
                        .send(Err("无法发送网站会话请求，请重试".into()));
                }
            }
        }
        Ok(())
    }

    pub fn page_ready(&self, window: &WebviewWindow, challenge: bool) -> Result<(), String> {
        Self::validate_sender(window)?;
        self.ready.store(!challenge, Ordering::SeqCst);
        if challenge {
            if !self.pending.lock().unwrap().is_empty() {
                let _ = window.show();
                let _ = window.set_focus();
            }
        } else {
            let _ = window.hide();
            self.dispatch(window)?;
        }
        Ok(())
    }

    pub fn receive(
        &self,
        window: &WebviewWindow,
        id: &str,
        reply: SiteReply,
    ) -> Result<(), String> {
        Self::validate_sender(window)?;
        let mut pending = self.pending.lock().unwrap();
        let Some(request) = pending.get_mut(id) else {
            return Ok(());
        };
        if matches!(reply, SiteReply::Challenge) {
            request.dispatched = false;
            self.ready.store(false, Ordering::SeqCst);
            // Navigation interrupts other fetches. Never replay a write whose result is unknown.
            let interrupted = pending
                .iter()
                .filter(|(_, request)| request.dispatched)
                .map(|(key, _)| key.clone())
                .collect::<Vec<_>>();
            for key in interrupted {
                if let Some(request) = pending.remove(&key) {
                    let _ = request.sender.send(Err(
                        "网站需要验证，操作结果尚未确认，请完成验证后刷新查看".into(),
                    ));
                }
            }
            drop(pending);
            let _ = window.show();
            let _ = window.set_focus();
            if window.navigate(SESSION_PAGE.parse().unwrap()).is_err() {
                self.cancel("无法打开网站验证页面，请重试");
            }
        } else {
            let request = pending.remove(id).unwrap();
            let result = match reply {
                SiteReply::Success { data } => Ok(data),
                SiteReply::Error { message } => Err(message),
                SiteReply::Challenge => unreachable!(),
            };
            let _ = request.sender.send(result);
        }
        Ok(())
    }

    pub fn cancel(&self, message: &str) {
        for (_, request) in self.pending.lock().unwrap().drain() {
            let _ = request.sender.send(Err(message.into()));
        }
    }

    fn validate_sender(window: &WebviewWindow) -> Result<(), String> {
        if window.label() != WINDOW_LABEL
            || window
                .url()
                .map_err(|_| "无法确认网站来源")?
                .origin()
                .ascii_serialization()
                != DISCOURSE_URL
        {
            return Err("不允许的网站会话来源".into());
        }
        Ok(())
    }

    pub fn has_session(app: &AppHandle) -> Result<bool, String> {
        let window = app.get_webview_window("main").ok_or("主窗口不存在")?;
        let cookies = window
            .cookies_for_url(DISCOURSE_URL.parse().unwrap())
            .map_err(|_| "无法读取本地登录会话")?;
        Ok(cookies
            .iter()
            .any(|cookie| cookie.name() == "_t" && !cookie.value().is_empty()))
    }

    pub fn clear_session(app: &AppHandle) -> Result<(), String> {
        let window = app.get_webview_window("main").ok_or("主窗口不存在")?;
        let cookies = window
            .cookies_for_url(DISCOURSE_URL.parse().unwrap())
            .map_err(|_| "无法读取本地登录会话")?;
        for cookie in cookies {
            if matches!(cookie.name(), "_t" | "_forum_session") {
                window
                    .delete_cookie(cookie)
                    .map_err(|_| "无法清除本地登录会话")?;
            }
        }
        Ok(())
    }
}

//! 验证码转发（P4）。
//!
//! 手机解析出验证码后有两条路送过来，这里统一成同一个投递入口：
//! - **局域网**：手机是服务端，所以电脑用长轮询 `GET /alive/events` 挂着等推送
//! - **中继**：同网的兜底，也覆盖"不在同一局域网"的情况
//!
//! 优先局域网不只是为了快——验证码是敏感信息，能不出公网就不出公网。

use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

use crate::lan::{self, LanPeer, LanRuntime};

/// 长轮询单次等待上限，要略大于手机端的挂住时长（25s）
const POLL_TIMEOUT: Duration = Duration::from_secs(35);
const POLL_RETRY_DELAY: Duration = Duration::from_secs(1);

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Otp {
    pub code: String,
    #[serde(default)]
    pub sender: String,
    #[serde(default)]
    pub service: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub ts: u64,
    /// 实际来源通道：`lan` / `relay`，仅用于展示与排查
    #[serde(default)]
    pub via: String,
}

/// 统一的投递入口：弹到界面最前面
pub fn deliver(app: &AppHandle, mut otp: Otp, via: &str) {
    if otp.code.is_empty() {
        return;
    }
    otp.via = via.to_string();
    println!(
        "[alive-otp] via={via} code={} service={} sender={}",
        otp.code, otp.service, otp.sender
    );
    // 窗口可能被收进托盘了，验证码必须能立刻看到
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    let _ = app.emit("otp-received", otp);
}

/// 常驻任务：一旦发现已验证可用的局域网通道，就挂长轮询收推送。
pub fn start_lan_poller(app: AppHandle, lan_runtime: Arc<LanRuntime>) {
    tauri::async_runtime::spawn(async move {
        loop {
            let Some(peer) = lan_runtime.peer() else {
                tokio::time::sleep(POLL_RETRY_DELAY).await;
                continue;
            };
            let key = match lan::lan_key() {
                Ok(key) => key,
                Err(_) => {
                    tokio::time::sleep(Duration::from_secs(5)).await;
                    continue;
                }
            };
            match poll_once(&peer, &key).await {
                Ok(events) => {
                    for event in events {
                        if event.get("type").and_then(|t| t.as_str()) != Some("otp") {
                            continue;
                        }
                        match serde_json::from_value::<Otp>(event) {
                            Ok(otp) => deliver(&app, otp, "lan"),
                            Err(e) => println!("[alive-otp] 解析局域网事件失败：{e}"),
                        }
                    }
                }
                Err(reason) => {
                    // 通道失效（换端口/手机重启/换网）时静默重试，地址由 lan 模块负责刷新
                    println!("[alive-otp] 局域网长轮询断开：{reason}");
                    tokio::time::sleep(POLL_RETRY_DELAY).await;
                }
            }
        }
    });
}

/// 一次长轮询：挂着直到手机有事件（或超时）才返回
async fn poll_once(peer: &LanPeer, key: &[u8]) -> Result<Vec<serde_json::Value>, String> {
    let ts = lan::now_secs();
    let nonce = format!("{:016x}", rand::random::<u64>());
    let signature = lan::sign_request(key, "GET", lan::EVENTS_PATH, ts, &nonce);
    let request = format!(
        "GET {}?ts={ts}&nonce={nonce}&sig={signature} HTTP/1.1\r\n\
         Host: {}:{}\r\n\
         Accept: application/json\r\n\
         Connection: close\r\n\r\n",
        lan::EVENTS_PATH,
        peer.addr,
        peer.port
    );

    let mut stream = tokio::time::timeout(
        Duration::from_millis(3000),
        TcpStream::connect((peer.addr.as_str(), peer.port)),
    )
    .await
    .map_err(|_| "连接超时".to_string())?
    .map_err(|e| e.to_string())?;

    stream
        .write_all(request.as_bytes())
        .await
        .map_err(|e| e.to_string())?;

    let mut buf = Vec::with_capacity(1024);
    let _ = tokio::time::timeout(POLL_TIMEOUT, stream.read_to_end(&mut buf)).await;

    let response = String::from_utf8_lossy(&buf);
    let first_line = response.lines().next().unwrap_or("");
    if !first_line.contains(" 200") {
        return Err(if first_line.is_empty() {
            "无响应".to_string()
        } else {
            first_line.to_string()
        });
    }

    let body = response
        .split_once("\r\n\r\n")
        .map(|(_, b)| b)
        .unwrap_or("");
    let parsed: serde_json::Value =
        serde_json::from_str(body).map_err(|e| format!("响应不是 JSON：{e}"))?;
    Ok(parsed
        .get("events")
        .and_then(|e| e.as_array())
        .cloned()
        .unwrap_or_default())
}

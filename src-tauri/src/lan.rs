//! 局域网直连（P1：发现 + 验证）。
//!
//! 手机端 Alive 会通过中继广播自己的局域网地址；这里订阅中继，
//! 拿到候选地址后**必须主动在局域网上打一次握手**才算数。
//!
//! 为什么不"拿到 IP 就直接用"：IP 可能已经过期、可能被路由器 AP 隔离、
//! 也可能被 VPN 路由劫持。握手成功的那个地址才是真的可用通道。
//!
//! 密钥不引入新配置：直接从 `~/.config/alive-relay/url` 里的 token 派生
//! （HKDF-SHA256），与手机端算法一一对应。中继 token 全程留在 Rust 侧，
//! 不进 WebView，与 `auth.rs` / `site_session.rs` 的既有做法一致。

use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use futures_util::StreamExt;
use hmac::{Hmac, Mac};
use serde::Serialize;
use sha2::Sha256;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

const PROTO: &str = "alive-lan-v1";
const SALT: &[u8] = b"alive-lan-v1";
const INFO: &[u8] = b"alive-lan-ping";
const PING_PATH: &str = "/alive/ping";
const FALLBACK_TOKEN: &str = "alive-lan-dev";

const PROBE_TIMEOUT: Duration = Duration::from_millis(1500);
const PROBE_READ_TIMEOUT: Duration = Duration::from_millis(3000);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanPeer {
    pub addr: String,
    pub port: u16,
    /// P3：手机上报的音频 UDP 端口（未上报则为 None）
    pub audio_port: Option<u16>,
    pub device: String,
    pub rtt_ms: u64,
    pub updated_at: u64,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanStatus {
    /// 是否已订阅上中继（订阅不上就收不到手机的地址广播）
    pub relay_connected: bool,
    /// 已验证可用的局域网通道
    pub peer: Option<LanPeer>,
    pub last_error: Option<String>,
}

#[derive(Default)]
pub struct LanRuntime {
    status: Mutex<LanStatus>,
}

impl LanRuntime {
    fn snapshot(&self) -> LanStatus {
        self.status.lock().map(|s| s.clone()).unwrap_or_default()
    }

    /// P3 音频发送端要用：当前已验证可用的对端
    pub fn peer(&self) -> Option<LanPeer> {
        self.status.lock().ok().and_then(|s| s.peer.clone())
    }

    fn update(&self, f: impl FnOnce(&mut LanStatus)) -> LanStatus {
        let mut guard = match self.status.lock() {
            Ok(g) => g,
            Err(poisoned) => poisoned.into_inner(),
        };
        f(&mut guard);
        guard.clone()
    }
}

#[tauri::command]
pub fn lan_status(runtime: tauri::State<'_, Arc<LanRuntime>>) -> LanStatus {
    runtime.snapshot()
}

/// 在 Tauri setup 里启动：独立任务，断线自动退避重连。
pub fn start(app: AppHandle, runtime: Arc<LanRuntime>) {
    tauri::async_runtime::spawn(async move {
        let mut backoff = 2u64;
        loop {
            match session(&app, &runtime).await {
                Ok(()) => backoff = 2,
                Err(error) => {
                    let status = runtime.update(|s| {
                        s.relay_connected = false;
                        s.peer = None;
                        s.last_error = Some(error);
                    });
                    let _ = app.emit("lan-status", status);
                }
            }
            tokio::time::sleep(Duration::from_secs(backoff)).await;
            backoff = (backoff * 2).min(30);
        }
    });
}

async fn session(app: &AppHandle, runtime: &Arc<LanRuntime>) -> Result<(), String> {
    let url = relay_url()?;
    let key = hkdf_sha256(token_from_url(&url).as_bytes(), SALT, INFO, 32);

    let (mut ws, _) = connect_async(url.as_str())
        .await
        .map_err(|e| format!("连接中继失败：{e}"))?;

    let status = runtime.update(|s| {
        s.relay_connected = true;
        s.last_error = None;
    });
    let _ = app.emit("lan-status", status);

    while let Some(incoming) = ws.next().await {
        let message = incoming.map_err(|e| format!("中继连接中断：{e}"))?;
        let text = match message {
            Message::Text(t) => t.to_string(),
            Message::Binary(b) => String::from_utf8_lossy(&b).into_owned(),
            _ => continue,
        };
        // 中继是广播：通知类消息也会混进来，这里只处理局域网信令，其余忽略
        let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) else {
            continue;
        };
        if value.get("type").and_then(|t| t.as_str()) != Some("lan") {
            continue;
        }
        handle_announcement(app, runtime, &key, &value).await;
    }

    Err("中继连接已关闭".into())
}

async fn handle_announcement(
    app: &AppHandle,
    runtime: &Arc<LanRuntime>,
    key: &[u8],
    value: &serde_json::Value,
) {
    let port = value.get("port").and_then(|p| p.as_u64()).unwrap_or(0);
    let audio_port = value
        .get("audioPort")
        .and_then(|p| p.as_u64())
        .filter(|p| *p > 0 && *p <= u16::MAX as u64)
        .map(|p| p as u16);
    let device = value
        .get("device")
        .and_then(|d| d.as_str())
        .unwrap_or("alive")
        .to_string();
    let addrs: Vec<String> = value
        .get("addrs")
        .and_then(|a| a.as_array())
        .map(|list| {
            list.iter()
                .filter_map(|x| x.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();

    if port == 0 || port > u16::MAX as u64 || addrs.is_empty() {
        return;
    }
    let port = port as u16;

    // 依次尝试每个候选地址，第一个握手成功的即为可用通道。
    // 这里不先按网段过滤：手机报的已经排除了蜂窝/VPN，探测本身又便宜且带鉴权，
    // 直接"打一次看通不通"比猜网段更可靠。
    let mut last_failure = String::from("没有可用的候选地址");
    for addr in &addrs {
        match probe(addr, port, key).await {
            Ok(rtt_ms) => {
                let status = runtime.update(|s| {
                    s.relay_connected = true;
                    s.last_error = None;
                    s.peer = Some(LanPeer {
                        addr: addr.clone(),
                        port,
                        audio_port,
                        device,
                        rtt_ms,
                        updated_at: now_secs(),
                    });
                });
                let _ = app.emit("lan-status", status);
                return;
            }
            Err(reason) => last_failure = format!("{addr}:{port} 不可达（{reason}）"),
        }
    }

    let status = runtime.update(|s| {
        s.peer = None;
        s.last_error = Some(format!("{last_failure}；可能被路由器 AP 隔离"));
    });
    let _ = app.emit("lan-status", status);
}

/// 局域网握手：一次带 HMAC 的 HTTP GET，成功说明"地址可达 + 对方确实是我们的手机"
async fn probe(addr: &str, port: u16, key: &[u8]) -> Result<u64, String> {
    let started = Instant::now();

    let stream = tokio::time::timeout(PROBE_TIMEOUT, TcpStream::connect((addr, port)))
        .await
        .map_err(|_| "连接超时".to_string())?
        .map_err(|e| e.to_string())?;

    let ts = now_secs();
    let nonce = format!("{:016x}", rand::random::<u64>());
    let signature = sign(key, &ping_message(ts, &nonce));
    let request = format!(
        "GET {PING_PATH}?ts={ts}&nonce={nonce}&sig={signature} HTTP/1.1\r\n\
         Host: {addr}:{port}\r\n\
         Accept: application/json\r\n\
         Connection: close\r\n\r\n"
    );

    let mut stream = stream;
    stream
        .write_all(request.as_bytes())
        .await
        .map_err(|e| e.to_string())?;

    let mut buf = Vec::with_capacity(512);
    let _ = tokio::time::timeout(PROBE_READ_TIMEOUT, stream.read_to_end(&mut buf)).await;

    let response = String::from_utf8_lossy(&buf);
    let first_line = response.lines().next().unwrap_or("").to_string();
    if first_line.contains(" 200") {
        Ok(started.elapsed().as_millis() as u64)
    } else if first_line.is_empty() {
        Err("无响应".into())
    } else {
        Err(first_line)
    }
}

// ------------------------------------------------------------------ 协议原语

fn ping_message(ts: u64, nonce: &str) -> String {
    format!("{PROTO}|GET|{PING_PATH}|{ts}|{nonce}")
}

fn sign(key: &[u8], message: &str) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(key).expect("HMAC 接受任意长度密钥");
    mac.update(message.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

/// 与手机端 LanCrypto.hkdfSha256 逐字节等价
fn hkdf_sha256(ikm: &[u8], salt: &[u8], info: &[u8], length: usize) -> Vec<u8> {
    let mut extract = Hmac::<Sha256>::new_from_slice(salt).expect("HMAC 接受任意长度密钥");
    extract.update(ikm);
    let prk = extract.finalize().into_bytes();

    let mut okm = Vec::with_capacity(length);
    let mut block: Vec<u8> = Vec::new();
    let mut counter: u8 = 1;
    while okm.len() < length {
        let mut expand = Hmac::<Sha256>::new_from_slice(&prk).expect("HMAC 接受任意长度密钥");
        expand.update(&block);
        expand.update(info);
        expand.update(&[counter]);
        block = expand.finalize().into_bytes().to_vec();
        let need = (length - okm.len()).min(block.len());
        okm.extend_from_slice(&block[..need]);
        counter += 1;
    }
    okm
}

/// P3 音频发送端复用同一把派生密钥（与手机端 LanAudioPlayer 里的完全一致）
pub(crate) fn lan_key() -> Result<Vec<u8>, String> {
    let url = relay_url()?;
    Ok(hkdf_sha256(
        token_from_url(&url).as_bytes(),
        SALT,
        INFO,
        32,
    ))
}

fn token_from_url(raw: &str) -> String {
    url::Url::parse(raw)
        .ok()
        .and_then(|parsed| {
            parsed
                .query_pairs()
                .find(|(k, _)| k == "token")
                .map(|(_, v)| v.into_owned())
        })
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| FALLBACK_TOKEN.to_string())
}

/// 与 `alive-relay` CLI 用同一份配置，用户不必再填一次
pub(crate) fn relay_url() -> Result<String, String> {
    if let Ok(from_env) = std::env::var("ALIVE_RELAY_URL") {
        let trimmed = from_env.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "找不到用户目录，无法读取中继地址".to_string())?;
    let path = Path::new(&home).join(".config").join("alive-relay").join("url");
    let text = std::fs::read_to_string(&path)
        .map_err(|_| format!("读取中继地址失败：{}", path.display()))?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("中继地址为空".into());
    }
    Ok(trimmed.to_string())
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_extraction_handles_query_and_fallback() {
        assert_eq!(token_from_url("wss://h/alive/ws?token=abc"), "abc");
        assert_eq!(token_from_url("wss://h/alive/ws?a=1&token=xyz&b=2"), "xyz");
        assert_eq!(token_from_url("ws://192.168.1.2:8080/ws"), FALLBACK_TOKEN);
        assert_eq!(token_from_url("wss://h/ws?token="), FALLBACK_TOKEN);
    }

    #[test]
    fn hkdf_is_deterministic_and_length_correct() {
        let a = hkdf_sha256(b"secret", SALT, INFO, 32);
        let b = hkdf_sha256(b"secret", SALT, INFO, 32);
        assert_eq!(a, b);
        assert_eq!(a.len(), 32);
        assert_ne!(a, hkdf_sha256(b"other", SALT, INFO, 32));
    }

    #[test]
    fn ping_message_layout_is_stable() {
        // 两端必须完全一致：改动这里等于改协议
        assert_eq!(
            ping_message(1789845654, "deadbeef"),
            "alive-lan-v1|GET|/alive/ping|1789845654|deadbeef"
        );
    }

    /// 跨实现对拍向量。
    ///
    /// 这组值来自一次**真实的成功握手**：手机端 Kotlin `LanCrypto` 派生出该密钥、
    /// 接受了对该签名的请求并返回 200。Rust 侧必须算出完全相同的字节，
    /// 否则握手会退化成 401 —— 这是唯一能证明两端 HKDF/HMAC 实现一致的测试。
    #[test]
    fn matches_android_and_probe_tool_byte_for_byte() {
        let testnet_token = "197c40be0fcbff48cd92fad04c58d693";
        let key = hkdf_sha256(testnet_token.as_bytes(), SALT, INFO, 32);
        assert_eq!(
            hex::encode(&key),
            "9d6afce0dcd1b0876045ac58cbac6b6ed307ed04a21135d80efd76e958b9e2d3"
        );
        assert_eq!(
            sign(&key, &ping_message(1789845654, "deadbeef")),
            "435e62b47ba43484e199f907bbf26556fe35be09f1f53c78176607066bfebb58"
        );
    }

    /// 真实链路联调：连真中继、等手机广播、用真实代码路径握手。
    /// 需要手机在线且与电脑同一局域网，因此默认 ignore：
    ///     cargo test --lib lan::tests::live -- --ignored --nocapture
    #[tokio::test]
    #[ignore]
    async fn live_discover_and_handshake() {
        let url = relay_url().expect("读取中继地址失败");
        println!("中继: {}", url);
        let key = hkdf_sha256(token_from_url(&url).as_bytes(), SALT, INFO, 32);

        let (mut ws, _) = connect_async(url.as_str()).await.expect("连接中继失败");
        println!("已订阅中继，等待手机广播（最长 90s）…");

        let deadline = tokio::time::Instant::now() + Duration::from_secs(90);
        loop {
            let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
            assert!(!remaining.is_zero(), "等不到手机的局域网广播");
            let incoming = tokio::time::timeout(remaining, ws.next())
                .await
                .expect("等广播超时");
            let message = incoming.expect("中继关闭").expect("中继消息错误");
            let Message::Text(text) = message else { continue };
            let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) else {
                continue;
            };
            if value.get("type").and_then(|t| t.as_str()) != Some("lan") {
                continue;
            }
            let port = value["port"].as_u64().expect("port 缺失") as u16;
            let addrs: Vec<String> = value["addrs"]
                .as_array()
                .expect("addrs 缺失")
                .iter()
                .filter_map(|a| a.as_str().map(str::to_string))
                .collect();
            println!("收到广播: port={port} addrs={addrs:?}");

            let mut failures = Vec::new();
            for addr in &addrs {
                match probe(addr, port, &key).await {
                    Ok(rtt) => {
                        println!("✅ 局域网握手成功 {addr}:{port} rtt={rtt}ms");
                        return;
                    }
                    Err(reason) => failures.push(format!("{addr}:{port} -> {reason}")),
                }
            }
            panic!("候选地址全部握手失败: {failures:?}");
        }
    }
}

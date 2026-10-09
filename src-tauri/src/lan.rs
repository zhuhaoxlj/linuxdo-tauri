//! 局域网直连（P1：发现 + 验证）。
//!
//! 手机端 Alive 会通过中继广播自己的局域网地址；这里订阅中继，
//! 拿到候选地址后**必须主动在局域网上打一次握手**才算数。
//!
//! 为什么不"拿到 IP 就直接用"：IP 可能已经过期、可能被路由器 AP 隔离、
//! 也可能被 VPN 路由劫持。握手成功的那个地址才是真的可用通道。
//!
//! 密钥不引入新配置：直接从 `~/.config/alive-relay/url` 里的 token 派生
//! （HKDF-SHA256），与手机端算法一一对应。已有中继 token 不回传 WebView；
//! 设置页输入的新 token 仅提交给 Rust 持久化，不存浏览器存储。

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use futures_util::{SinkExt, StreamExt};
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
pub(crate) const PING_PATH: &str = "/alive/ping";
/// 长轮询事件端点（与手机端 LanServer.EVENTS_PATH 一致）
pub(crate) const EVENTS_PATH: &str = "/alive/events";
const FALLBACK_TOKEN: &str = "alive-lan-dev";

const PROBE_TIMEOUT: Duration = Duration::from_millis(1500);
const PROBE_READ_TIMEOUT: Duration = Duration::from_millis(3000);
/// 对端信息多久算"不新鲜"：超过就再问一次地址
const PEER_FRESH_SECS: u64 = 60;
/// 主动查询的最小间隔（只在信息不新鲜时才真的发）
const REQUEST_EVERY_SECS: u64 = 5;

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
    /// 缺少配置时，界面提供设置入口，而不是泛化为连接失败。
    pub configuration_required: bool,
    /// 已验证可用的局域网通道
    pub peer: Option<LanPeer>,
    pub last_error: Option<String>,
}

#[derive(Default)]
pub struct LanRuntime {
    status: Mutex<LanStatus>,
    reconnect: tokio::sync::Notify,
}

impl LanRuntime {
    fn snapshot(&self) -> LanStatus {
        self.status.lock().map(|s| s.clone()).unwrap_or_default()
    }

    /// 对端信息是否已经不新鲜（或干脆没有），需要再问一次地址
    fn needs_discovery(&self, fresh_secs: u64) -> bool {
        match self.status.lock() {
            Ok(s) => match &s.peer {
                Some(p) => now_secs().saturating_sub(p.updated_at) > fresh_secs,
                None => true,
            },
            Err(_) => true,
        }
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
            let result = tokio::select! {
                result = session(&app, &runtime) => result,
                _ = runtime.reconnect.notified() => {
                    backoff = 2;
                    continue;
                }
            };
            match result {
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
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(backoff)) => {},
                _ = runtime.reconnect.notified() => { backoff = 2; continue; }
            }
            backoff = (backoff * 2).min(30);
        }
    });
}

async fn session(app: &AppHandle, runtime: &Arc<LanRuntime>) -> Result<(), String> {
    let status = runtime.update(|s| {
        s.configuration_required = relay_url().is_err();
    });
    let _ = app.emit("lan-status", status);
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

    // 中继不存历史消息：手机的地址广播每 45 秒才一次，若刚好错过就得干等。
    // 连上就主动问一次，并在对端信息不新鲜时继续问。
    let _ = ws
        .send(Message::Text(lan_request().into()))
        .await
        .map_err(|e| format!("发送发现请求失败：{e}"))?;

    let mut request_ticker = tokio::time::interval(Duration::from_secs(REQUEST_EVERY_SECS));
    request_ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    request_ticker.tick().await; // 第一次 tick 立即返回，上面已经问过了

    loop {
        let message = tokio::select! {
            incoming = ws.next() => {
                let Some(incoming) = incoming else { break };
                incoming.map_err(|e| format!("中继连接中断：{e}"))?
            }
            _ = request_ticker.tick() => {
                if runtime.needs_discovery(PEER_FRESH_SECS) {
                    if ws.send(Message::Text(lan_request().into())).await.is_err() {
                        break;
                    }
                }
                continue;
            }
        };
        let text = match message {
            Message::Text(t) => t.to_string(),
            Message::Binary(b) => String::from_utf8_lossy(&b).into_owned(),
            _ => continue,
        };
        // 中继是广播：通知类消息也会混进来，这里只处理局域网信令，其余忽略
        let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) else {
            continue;
        };
        match value.get("type").and_then(|t| t.as_str()) {
            // 中继兜底通道上的验证码
            Some("otp") => match serde_json::from_value::<crate::otp::Otp>(value.clone()) {
                Ok(otp) => crate::otp::deliver(app, otp, "relay"),
                Err(e) => println!("[alive-otp] 解析中继验证码失败：{e}"),
            },
            Some("lan") => handle_announcement(app, runtime, &key, &value).await,
            _ => {}
        }
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
                println!("[alive-lan] 局域网通道就绪 {addr}:{port} rtt={rtt_ms}ms");
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

/// 供 otp 模块复用：按 "方法|路径|ts|nonce" 规范串签名
pub(crate) fn sign_request(key: &[u8], method: &str, path: &str, ts: u64, nonce: &str) -> String {
    sign(key, &request_message(method, path, ts, nonce))
}

fn request_message(method: &str, path: &str, ts: u64, nonce: &str) -> String {
    format!("{PROTO}|{method}|{path}|{ts}|{nonce}")
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
    Ok(hkdf_sha256(token_from_url(&url).as_bytes(), SALT, INFO, 32))
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

fn relay_config_path() -> Result<PathBuf, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "找不到用户目录，无法读取中继地址".to_string())?;
    Ok(Path::new(&home)
        .join(".config")
        .join("alive-relay")
        .join("url"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelaySettings {
    configured: bool,
    endpoint: String,
    has_token: bool,
    environment_override: bool,
}

fn relay_settings_snapshot() -> RelaySettings {
    let environment_override =
        std::env::var("ALIVE_RELAY_URL").is_ok_and(|value| !value.trim().is_empty());
    let value = relay_url().ok();
    relay_settings_from_url(value.as_deref(), environment_override)
}

fn relay_settings_from_url(value: Option<&str>, environment_override: bool) -> RelaySettings {
    let parsed = value.and_then(|value| url::Url::parse(value).ok());
    let has_token = parsed.as_ref().is_some_and(|url| {
        url.query_pairs()
            .any(|(key, value)| key == "token" && !value.is_empty())
    });
    let endpoint = parsed
        .map(|mut url| {
            // 不向 WebView 返回任何查询参数、凭证或片段。
            url.set_query(None);
            url.set_fragment(None);
            let _ = url.set_username("");
            let _ = url.set_password(None);
            url.to_string()
        })
        .unwrap_or_default();
    RelaySettings {
        configured: !endpoint.is_empty(),
        endpoint,
        has_token,
        environment_override,
    }
}

#[tauri::command]
pub fn relay_settings() -> RelaySettings {
    relay_settings_snapshot()
}

fn configured_url(endpoint: &str, token: &str) -> Result<String, String> {
    let mut url = url::Url::parse(endpoint.trim())
        .map_err(|_| "请输入有效的 WebSocket 中继地址".to_string())?;
    if !matches!(url.scheme(), "ws" | "wss") || url.host_str().is_none() {
        return Err("中继地址必须以 wss:// 或 ws:// 开头".into());
    }
    if !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || url.query().is_some()
    {
        return Err(
            "地址中不要包含用户名、密码、查询参数或片段；请在认证令牌栏单独填写 token".into(),
        );
    }
    if token.trim().is_empty() {
        return Err("请填写与手机 Alive 一致的认证令牌".into());
    }
    url.query_pairs_mut().append_pair("token", token.trim());
    Ok(url.to_string())
}

fn persist_relay_url(path: &Path, value: &str) -> Result<(), String> {
    use std::io::Write;
    let parent = path.parent().ok_or("无效的配置目录")?;
    std::fs::create_dir_all(parent).map_err(|_| "创建中继配置目录失败".to_string())?;
    let temporary = parent.join(format!(".url-{}", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options
            .open(&temporary)
            .map_err(|_| "创建中继配置失败".to_string())?;
        writeln!(file, "{value}").map_err(|_| "写入中继配置失败".to_string())?;
        file.sync_all()
            .map_err(|_| "保存中继配置失败".to_string())?;
        std::fs::rename(&temporary, path).map_err(|_| "替换中继配置失败".to_string())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result
}

#[tauri::command]
pub fn save_relay_settings(
    app: AppHandle,
    runtime: tauri::State<'_, Arc<LanRuntime>>,
    endpoint: String,
    token: String,
) -> Result<RelaySettings, String> {
    if relay_settings_snapshot().environment_override {
        return Err("当前由 ALIVE_RELAY_URL 环境变量管理；请移除环境变量后再在设置中保存".into());
    }
    // 空输入保留已有令牌；从不把已有令牌返回给前端。
    let existing = relay_url()
        .ok()
        .and_then(|value| url::Url::parse(&value).ok());
    let token = if token.trim().is_empty() {
        existing
            .and_then(|url| {
                url.query_pairs()
                    .find(|(key, _)| key == "token")
                    .map(|(_, value)| value.into_owned())
            })
            .unwrap_or_default()
    } else {
        token
    };
    let value = configured_url(&endpoint, &token)?;
    persist_relay_url(&relay_config_path()?, &value)?;
    let status = runtime.update(|s| {
        s.relay_connected = false;
        s.configuration_required = false;
        s.peer = None;
        s.last_error = None;
    });
    let _ = app.emit("lan-status", status);
    runtime.reconnect.notify_one();
    Ok(relay_settings_snapshot())
}

/// 与 `alive-relay` CLI 用同一份配置，用户不必再填一次
pub(crate) fn relay_url() -> Result<String, String> {
    if let Ok(from_env) = std::env::var("ALIVE_RELAY_URL") {
        let trimmed = from_env.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }
    let path = relay_config_path()?;
    let text = std::fs::read_to_string(&path)
        .map_err(|_| "尚未配置手机连接，请前往设置 → 手机连接填写中继地址和认证令牌".to_string())?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("中继地址为空".into());
    }
    Ok(trimmed.to_string())
}

/// 主动请求手机立刻广播一次局域网地址
fn lan_request() -> String {
    serde_json::json!({
        "type": "lan-req",
        "v": 1,
        "role": "desktop",
        "ts": now_secs(),
    })
    .to_string()
}

pub(crate) fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_never_return_saved_credentials() {
        let settings = relay_settings_from_url(
            Some("wss://user:password@example.org/ws?token=private-token&secret=hidden#fragment"),
            false,
        );
        assert!(settings.configured);
        assert!(settings.has_token);
        assert_eq!(settings.endpoint, "wss://example.org/ws");
        let json = serde_json::to_string(&settings).unwrap();
        for secret in ["password", "private-token", "hidden", "fragment", "user:"] {
            assert!(!json.contains(secret));
        }
        let missing = relay_settings_from_url(None, false);
        assert!(!missing.configured);
        assert!(!missing.has_token);
    }

    #[test]
    fn settings_validate_and_encode_credentials() {
        let value = configured_url(" wss://example.org/alive/ws ", "a&b+c=?/#").unwrap();
        assert_eq!(token_from_url(&value), "a&b+c=?/#");
        for endpoint in [
            "https://example.org/ws",
            "not a url",
            "wss://user:pass@example.org/ws",
            "wss://example.org/ws?token=secret",
            "wss://example.org/ws#fragment",
        ] {
            let error = configured_url(endpoint, "private-token").unwrap_err();
            assert!(!error.contains("private-token"));
            assert!(!error.contains("secret"));
        }
        assert!(configured_url("wss://example.org/ws", " ").is_err());
    }

    #[test]
    fn settings_persist_atomically_with_private_permissions() {
        let directory =
            std::env::temp_dir().join(format!("alive-config-test-{}", uuid::Uuid::new_v4()));
        let path = directory.join("url");
        persist_relay_url(&path, "wss://example.org/ws?token=first").unwrap();
        persist_relay_url(&path, "wss://example.org/ws?token=second").unwrap();
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            "wss://example.org/ws?token=second\n"
        );
        assert_eq!(std::fs::read_dir(&directory).unwrap().count(), 1);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
        std::fs::remove_dir_all(directory).unwrap();
    }

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
        println!("中继配置已读取（认证令牌不输出）");
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
            let Message::Text(text) = message else {
                continue;
            };
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

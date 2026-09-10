use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rsa::{RsaPrivateKey, RsaPublicKey, pkcs1::EncodeRsaPublicKey, Pkcs1v15Encrypt};
use rand::rngs::OsRng;

#[derive(Default)]
struct AppState {
    private_key: Mutex<Option<RsaPrivateKey>>,
    nonce: Mutex<Option<String>>,
    api_key: Mutex<Option<String>>,
}

#[derive(Serialize, Deserialize)]
struct AuthResult {
    api_key: String,
    user: serde_json::Value,
}

const DISCOURSE_URL: &str = "https://linux.do";
const CLIENT_ID: &str = "linuxdo_tauri_client";
const APP_NAME: &str = "LinuxDo Tauri";
const SCOPES: &str = "read,write";

#[tauri::command]
async fn start_oauth_flow(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // 生成 RSA 密钥对
    let mut rng = OsRng;
    let bits = 2048;
    let private_key = RsaPrivateKey::new(&mut rng, bits)
        .map_err(|e| format!("生成 RSA 密钥失败: {}", e))?;
    
    let public_key = RsaPublicKey::from(&private_key);
    
    // 将公钥编码为 PEM 格式
    let public_key_pem = public_key
        .to_pkcs1_pem(rsa::pkcs1::LineEnding::LF)
        .map_err(|e| format!("编码公钥失败: {}", e))?;
    
    // 生成 nonce
    let nonce = uuid::Uuid::new_v4().to_string();
    
    // 保存私钥和 nonce
    *state.private_key.lock().unwrap() = Some(private_key);
    *state.nonce.lock().unwrap() = Some(nonce.clone());
    
    // 构建授权 URL
    let auth_url = format!(
        "{}/user-api-key/new?application_name={}&client_id={}&scopes={}&public_key={}&nonce={}&auth_redirect=discourse://auth_redirect",
        DISCOURSE_URL,
        urlencoding::encode(APP_NAME),
        urlencoding::encode(CLIENT_ID),
        urlencoding::encode(SCOPES),
        urlencoding::encode(&public_key_pem),
        urlencoding::encode(&nonce)
    );
    
    println!("授权 URL: {}", auth_url);
    
    // 在浏览器中打开授权页面
    tauri_plugin_opener::open_url(auth_url, None::<&str>)
        .map_err(|e| format!("打开浏览器失败: {}", e))?;
    
    Ok(())
}

#[tauri::command]
async fn handle_auth_callback(
    url: String,
    state: State<'_, AppState>,
) -> Result<AuthResult, String> {
    println!("处理认证回调: {}", url);
    
    // 解析 URL 参数
    let url_parsed = url::Url::parse(&url)
        .map_err(|e| format!("解析 URL 失败: {}", e))?;
    
    let mut payload = None;
    for (key, value) in url_parsed.query_pairs() {
        if key == "payload" {
            payload = Some(value.to_string());
            break;
        }
    }
    
    let payload = payload.ok_or("URL 中没有 payload 参数")?;
    
    // Base64 解码
    let encrypted_bytes = BASE64
        .decode(&payload)
        .map_err(|e| format!("Base64 解码失败: {}", e))?;
    
    // 使用私钥解密
    let private_key = state.private_key.lock().unwrap();
    let private_key = private_key.as_ref()
        .ok_or("私钥不存在")?;
    
    let decrypted = private_key
        .decrypt(Pkcs1v15Encrypt, &encrypted_bytes)
        .map_err(|e| format!("RSA 解密失败: {}", e))?;
    
    let decrypted_str = String::from_utf8(decrypted)
        .map_err(|e| format!("解密结果不是有效的 UTF-8: {}", e))?;
    
    println!("解密后的 payload: {}", decrypted_str);
    
    // 解析 JSON
    let payload_json: serde_json::Value = serde_json::from_str(&decrypted_str)
        .map_err(|e| format!("解析 JSON 失败: {}", e))?;
    
    let api_key = payload_json["key"]
        .as_str()
        .ok_or("payload 中没有 key 字段")?
        .to_string();
    
    // 保存 API key
    *state.api_key.lock().unwrap() = Some(api_key.clone());
    
    // 获取用户信息
    let client = reqwest::Client::new();
    let response = client
        .get(format!("{}/session/current.json", DISCOURSE_URL))
        .header("User-Api-Key", &api_key)
        .send()
        .await
        .map_err(|e| format!("获取用户信息失败: {}", e))?;
    
    let user_data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析用户信息失败: {}", e))?;
    
    let user = user_data["current_user"].clone();
    
    Ok(AuthResult { api_key, user })
}

#[tauri::command]
async fn fetch_topics(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let api_key = state.api_key.lock().unwrap();
    let api_key = api_key.as_ref()
        .ok_or("未登录")?;
    
    let client = reqwest::Client::new();
    let response = client
        .get(format!("{}/latest.json", DISCOURSE_URL))
        .header("User-Api-Key", api_key)
        .send()
        .await
        .map_err(|e| format!("获取话题列表失败: {}", e))?;
    
    let topics: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析话题列表失败: {}", e))?;
    
    Ok(topics)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            start_oauth_flow,
            handle_auth_callback,
            fetch_topics
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

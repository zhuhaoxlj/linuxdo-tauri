use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rand::rngs::OsRng;
use rsa::{pkcs1::EncodeRsaPublicKey, Pkcs1v15Encrypt, RsaPrivateKey, RsaPublicKey};
use serde::Deserialize;
use url::Url;

pub const DISCOURSE_URL: &str = "https://linux.do";

pub struct PendingLogin {
    private_key: RsaPrivateKey,
    nonce: String,
}

pub struct LoginCredentials {
    pub api_key: String,
    pub otp: String,
}

#[derive(Deserialize)]
struct AuthPayload {
    key: String,
    nonce: String,
}

impl PendingLogin {
    pub fn new() -> Result<Self, String> {
        Ok(Self {
            private_key: RsaPrivateKey::new(&mut OsRng, 2048)
                .map_err(|_| "生成登录密钥失败，请重试")?,
            nonce: uuid::Uuid::new_v4().to_string(),
        })
    }

    pub fn authorization_url(&self) -> Result<Url, String> {
        let public_key = RsaPublicKey::from(&self.private_key)
            .to_pkcs1_pem(rsa::pkcs1::LineEnding::LF)
            .map_err(|_| "编码登录公钥失败")?;
        let mut url = Url::parse(&format!("{DISCOURSE_URL}/user-api-key/new")).unwrap();
        url.query_pairs_mut()
            .append_pair("application_name", "LinuxDo Tauri")
            .append_pair("client_id", "linuxdo_tauri_client")
            .append_pair("scopes", "one_time_password")
            .append_pair("public_key", &public_key)
            .append_pair("nonce", &self.nonce)
            .append_pair("auth_redirect", "discourse://auth_redirect");
        Ok(url)
    }

    pub fn decode_callback(&self, callback: &str) -> Result<LoginCredentials, String> {
        let url = Url::parse(callback).map_err(|_| "登录回调地址无效")?;
        if url.scheme() != "discourse" || url.host_str() != Some("auth_redirect") {
            return Err("登录回调地址无效".into());
        }
        let parameter = |name: &str| {
            url.query_pairs()
                .find(|(key, _)| key == name)
                .map(|(_, value)| value.into_owned())
                .filter(|value| !value.is_empty())
        };
        let encrypted_payload = parameter("payload").ok_or("回调缺少授权凭证，请重新登录")?;
        let payload: AuthPayload = serde_json::from_str(&self.decrypt(&encrypted_payload)?)
            .map_err(|_| "授权凭证格式无效，请重新登录")?;
        if payload.nonce != self.nonce {
            return Err("回调不属于本次登录，请返回浏览器完成最新一次授权".into());
        }
        if payload.key.is_empty() {
            return Err("授权凭证为空，请重新登录".into());
        }
        let encrypted_otp =
            parameter("oneTimePassword").ok_or("网站未返回一次性登录令牌，请重新授权")?;
        let otp = self.decrypt(&encrypted_otp)?;
        if otp.is_empty()
            || !otp
                .bytes()
                .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
        {
            return Err("一次性登录令牌格式无效，请重新授权".into());
        }
        Ok(LoginCredentials {
            api_key: payload.key,
            otp,
        })
    }

    fn decrypt(&self, value: &str) -> Result<String, String> {
        // Discourse uses Ruby's Base64.encode64, which inserts line breaks.
        let compact: String = value
            .chars()
            .filter(|character| !character.is_ascii_whitespace())
            .collect();
        let encrypted = BASE64.decode(compact).map_err(|_| "授权凭证编码无效")?;
        let decrypted = self
            .private_key
            .decrypt(Pkcs1v15Encrypt, &encrypted)
            .map_err(|_| "授权凭证已失效，请重新登录")?;
        String::from_utf8(decrypted).map_err(|_| "授权凭证格式无效".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::{rngs::StdRng, SeedableRng};
    use std::sync::OnceLock;

    fn login() -> PendingLogin {
        static KEY: OnceLock<RsaPrivateKey> = OnceLock::new();
        PendingLogin {
            private_key: KEY
                .get_or_init(|| RsaPrivateKey::new(&mut StdRng::seed_from_u64(7), 1024).unwrap())
                .clone(),
            nonce: "current-login".into(),
        }
    }

    fn callback(login: &PendingLogin, nonce: &str, otp: Option<&str>) -> Url {
        let encrypt = |value: &str| {
            BASE64.encode(
                RsaPublicKey::from(&login.private_key)
                    .encrypt(&mut OsRng, Pkcs1v15Encrypt, value.as_bytes())
                    .unwrap(),
            )
        };
        let payload = serde_json::json!({ "nonce": nonce, "key": "test-api-key" });
        let mut url = Url::parse("discourse://auth_redirect").unwrap();
        url.query_pairs_mut()
            .append_pair("payload", &encrypt(&payload.to_string()));
        if let Some(otp) = otp {
            url.query_pairs_mut()
                .append_pair("oneTimePassword", &encrypt(otp));
        }
        url
    }

    #[test]
    fn decrypts_payload_and_separate_one_time_password() {
        let login = login();
        let url = callback(&login, &login.nonce, Some("012345abcdef"));
        let result = login.decode_callback(url.as_str()).unwrap();
        assert_eq!(result.api_key, "test-api-key");
        assert_eq!(result.otp, "012345abcdef");
    }

    #[test]
    fn decrypts_base64_values_with_line_breaks() {
        let login = login();
        let encrypted = RsaPublicKey::from(&login.private_key)
            .encrypt(&mut OsRng, Pkcs1v15Encrypt, b"012345abcdef")
            .unwrap();
        let encoded = BASE64.encode(encrypted);
        assert_eq!(
            login.decrypt(&format!("{encoded}\n")).unwrap(),
            "012345abcdef"
        );
    }

    #[test]
    fn rejects_a_callback_from_another_login() {
        let login = login();
        let url = callback(&login, "stale-login", Some("abcd1234"));
        assert!(login
            .decode_callback(url.as_str())
            .err()
            .unwrap()
            .contains("不属于本次登录"));
    }

    #[test]
    fn api_key_alone_is_not_a_login_session() {
        let login = login();
        let url = callback(&login, &login.nonce, None);
        assert!(login
            .decode_callback(url.as_str())
            .err()
            .unwrap()
            .contains("一次性登录令牌"));
    }

    #[test]
    fn rejects_other_callback_hosts_and_invalid_otp_paths() {
        let login = login();
        let mut url = callback(&login, &login.nonce, Some("abcd1234"));
        url.set_host(Some("auth_redirect.evil")).unwrap();
        assert!(login.decode_callback(url.as_str()).is_err());
        let url = callback(&login, &login.nonce, Some("../logout"));
        assert!(login.decode_callback(url.as_str()).is_err());
    }

    #[test]
    fn requests_supported_scope_with_matching_nonce_and_public_key() {
        let login = login();
        let params: std::collections::HashMap<_, _> = login
            .authorization_url()
            .unwrap()
            .query_pairs()
            .map(|(k, v)| (k.into_owned(), v.into_owned()))
            .collect();
        assert_eq!(params["scopes"], "one_time_password");
        assert_eq!(params["nonce"], login.nonce);
        assert_eq!(params["auth_redirect"], "discourse://auth_redirect");
        assert!(params["public_key"].starts_with("-----BEGIN RSA PUBLIC KEY-----"));
    }
}

use crate::auth::DISCOURSE_URL;

pub fn validate_request(path: &str, method: &str) -> Result<(), String> {
    if !matches!(method, "GET" | "POST" | "PUT" | "DELETE" | "PATCH") {
        return Err("不支持的请求方法".into());
    }
    if !path.starts_with('/') || path.starts_with("//") || path.contains('\\') {
        return Err("只允许访问论坛内的接口".into());
    }
    let base = url::Url::parse(DISCOURSE_URL).unwrap();
    let target = base.join(path).map_err(|_| "接口地址无效")?;
    if target.origin() != base.origin() || target.fragment().is_some() {
        return Err("只允许访问论坛内的接口".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_forum_api_paths_with_encoded_search_terms() {
        assert!(validate_request("/search.json?q=rust%20tauri", "GET").is_ok());
        assert!(validate_request("/posts.json", "POST").is_ok());
    }

    #[test]
    fn rejects_external_targets_and_unsupported_methods() {
        for path in [
            "https://evil.test/",
            "//evil.test/",
            "/\\evil.test/",
            "/posts#fragment",
        ] {
            assert!(validate_request(path, "GET").is_err());
        }
        assert!(validate_request("/posts.json", "CONNECT").is_err());
    }
}

fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "start_oauth_flow",
            "cancel_login",
            "handle_auth_callback",
            "restore_session",
            "logout",
            "discourse_request",
            "fetch_forum_image",
            "upload_file",
            "site_ready",
            "site_response",
        ]),
    ))
    .expect("failed to build Tauri application");
}

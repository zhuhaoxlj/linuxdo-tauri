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
            "shared_storage_load",
            "shared_storage_save",
            "shared_storage_put",
            "shared_storage_backup",
            "reminder_status",
            "take_reminder_open",
            // 局域网发现 + 音频推流（P1/P3）。必须登记在这里：
            // 否则不会生成 allow-* 权限，前端 invoke 会被 capability 直接拒绝
            // （事件推送不受此限制，所以光看界面会以为没问题）。
            "lan_status",
            "audio_status",
            "audio_start",
            "audio_stop",
            "otp_popup_closed",
        ]),
    ))
    .expect("failed to build Tauri application");
}

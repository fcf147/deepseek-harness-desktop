//! WebUI Shell — Tauri 应用入口（Rust 后端）

mod commands;
mod health;
mod proxy;
mod wsl;

use commands::{AppState, ProcessRegistry};
use tauri::Manager;

/// 启动 Tauri 应用，注册命令并注入共享状态。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let registry = std::sync::Arc::new(ProcessRegistry::new());
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState { registry })
        .invoke_handler(tauri::generate_handler![
            commands::get_wsl_state,
            commands::install_wsl,
            commands::install_service,
            commands::start_service,
            commands::stop_service,
            commands::health_check,
            commands::proxy_request,
        ])
        .setup(|app| {
            // 托盘图标（可选）。图标文件需在 src-tauri/icons/ 提供。
            if let Some(tray) = app.tray_by_id("main") {
                let _ = tray;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running WebUI Shell");
}

//! WebUI Shell — Tauri 应用入口（Rust 后端）

mod commands;
mod health;
mod proxy;
mod wsl;

use commands::AppState;
use wsl::ProcessRegistry;

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
        .setup(|_app| {
            // 当前为免安装绿色版，未启用托盘图标；如需托盘，在 tauri.conf.json 配置 trayIcon 后再补充。
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running WebUI Shell");
}

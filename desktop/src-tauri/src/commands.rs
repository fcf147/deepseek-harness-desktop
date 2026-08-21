//! Tauri command 注册（Rust 后端）
//! ----------------------------------------------------------------------------
//! 把 WSL 管理器 / 健康检查 / 代理 暴露给前端（src/api/wsl.ts、proxy.ts）。
//! 共享状态通过 Tauri 的 `manage` 注入。

use std::sync::Arc;

use serde::Serialize;
use tauri::State;

use crate::health;
use crate::proxy::{self, ProxyRequest};
use crate::wsl::{self, ProcessRegistry, WslState};

/// 前端可见的服务运行状态。
#[derive(Debug, Clone, Serialize)]
pub struct ServiceRuntime {
    pub id: String,
    pub status: String,
    pub url: Option<String>,
    pub version: Option<String>,
    pub error: Option<String>,
}

/// 托管状态：进程注册表（停止服务时使用）。
pub struct AppState {
    pub registry: Arc<ProcessRegistry>,
}

#[tauri::command]
pub fn get_wsl_state() -> WslState {
    wsl::detect()
}

#[tauri::command]
pub fn install_wsl() -> wsl::InstallResult {
    wsl::install()
}

#[tauri::command]
pub async fn install_service(id: String, distro: Option<String>) -> Result<(), String> {
    let state = wsl::detect();
    if state.status != "ready" {
        return Err(state.hint.unwrap_or_else(|| "WSL 不可用".into()));
    }
    let distro = distro.or(state.default_distro).ok_or("无可用发行版")?;
    // 第一步：DeepSeek Harness 走 bootstrap 脚本（scripts/bootstrap-dsh.sh）。
    // 实际打包时脚本随壳分发，这里以仓库内相对路径触发。
    let script = format!(
        "curl -fsSL https://raw.githubusercontent.com/summerwindow741/deepseek-harness-desktop/main/desktop/scripts/bootstrap-dsh.sh | bash"
    );
    let (code, _out, err) = wsl::exec_in_distro(&distro, &script);
    if code != 0 {
        return Err(format!("安装失败: {}", err));
    }
    let _ = id;
    Ok(())
}

#[tauri::command]
pub async fn start_service(
    id: String,
    distro: Option<String>,
    autostart_cmd: String,
    health_url: String,
    state: State<'_, AppState>,
) -> Result<ServiceRuntime, String> {
    let wsl_state = wsl::detect();
    if wsl_state.status != "ready" {
        return Err(wsl_state.hint.unwrap_or_else(|| "WSL 不可用".into()));
    }
    let distro = distro.or(wsl_state.default_distro).ok_or("无可用发行版")?;

    // 在 WSL 内启动 dsh web；保留子进程句柄以便停止。
    let child = wsl::spawn_in_distro(&distro, &autostart_cmd).ok_or("无法在 WSL 内启动服务")?;
    state.registry.register(&id, child);

    // 健康检查（带重试，规避端口转发初始延迟/断连）
    let healthy = health::check_with_retry(&health_url, 12, 2500).await;
    if !healthy {
        state.registry.stop(&id);
        return Ok(ServiceRuntime {
            id,
            status: "error".into(),
            url: None,
            version: None,
            error: Some("健康检查失败，服务未在预期端口就绪".into()),
        });
    }

    Ok(ServiceRuntime {
        id,
        status: "running".into(),
        url: Some(health_url.clone()),
        version: None,
        error: None,
    })
}

#[tauri::command]
pub fn stop_service(id: String, state: State<'_, AppState>) -> Result<bool, String> {
    Ok(state.registry.stop(&id))
}

#[tauri::command]
pub async fn health_check(url: String) -> Result<bool, String> {
    Ok(health::check_with_retry(&url, 3, 1000).await)
}

#[tauri::command]
pub async fn proxy_request(req: ProxyRequest) -> Result<String, String> {
    proxy::proxy(req).await
}

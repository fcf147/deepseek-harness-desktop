//! WSL 管理器（Rust 后端）
//! ----------------------------------------------------------------------------
//! 负责：
//!   - 检测 WSL 是否可用（`wsl --status` / `wsl -l -v`）
//!   - 未安装时触发 `wsl --install`（需管理员，返回需重启）
//!   - 枚举发行版、找出默认发行版
//!   - 在指定发行版内执行命令（安装 dsh / 启动 dsh web）
//!   - 管理服务子进程（启/停）
//!
//! 坑点规避（README 已知限制）：
//!   - WSL 安装需重启：install 返回 needs_reboot，由前端提示
//!   - 端口转发断连：health 模块负责重试（见 health.rs）
//!   - 非 Windows 平台（如 Linux 构建机）返回 NotSupported，无法实测

use std::collections::HashMap;
use std::process::{Child, Command, Stdio};

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct Distro {
    pub name: String,
    pub state: String,
    pub version: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct WslState {
    pub status: String,
    pub platform: String,
    pub distros: Vec<Distro>,
    pub default_distro: Option<String>,
    pub hint: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct InstallResult {
    pub triggered: bool,
    pub needs_reboot: bool,
    pub message: String,
}

const STATUS_NOT_SUPPORTED: &str = "not_supported";
const STATUS_NOT_INSTALLED: &str = "not_installed";
const STATUS_NO_DISTRO: &str = "no_distro";
const STATUS_READY: &str = "ready";
const STATUS_NEEDS_REBOOT: &str = "needs_reboot";

fn is_windows() -> bool {
    cfg!(target_os = "windows")
}

/// 在 Windows 上运行 `wsl <args>`，返回 (code, stdout, stderr)。
fn run_wsl(args: &[&str]) -> (i32, String, String) {
    if !is_windows() {
        return (-1, String::new(), "WSL is only supported on Windows".into());
    }
    let output = Command::new("wsl").args(args).output();
    match output {
        Ok(o) => (
            o.status.code().unwrap_or(-1),
            String::from_utf8_lossy(&o.stdout).to_string(),
            String::from_utf8_lossy(&o.stderr).to_string(),
        ),
        Err(e) => (-1, String::new(), e.to_string()),
    }
}

/// 检测 WSL 整体状态。
pub fn detect() -> WslState {
    let platform = if is_windows() { "win32" } else { "other" };
    if !is_windows() {
        return WslState {
            status: STATUS_NOT_SUPPORTED.into(),
            platform: platform.into(),
            distros: vec![],
            default_distro: None,
            hint: Some("WSL 仅支持 Windows 平台；当前为其他平台，无法运行 WSL 后端。".into()),
        };
    }

    let status_res = run_wsl(&["--status"]);
    if status_res.0 != 0 {
        // 可能是未安装。再用 --list 进一步判断。
        let list_res = run_wsl(&["--list", "--quiet"]);
        if list_res.0 != 0 {
            return WslState {
                status: STATUS_NOT_INSTALLED.into(),
                platform: platform.into(),
                distros: vec![],
                default_distro: None,
                hint: Some("WSL 未安装或被禁用。请以管理员身份运行 \"wsl --install\"。".into()),
            };
        }
    }

    let verbose = run_wsl(&["--list", "--verbose"]);
    let (distros, default_distro) = parse_distro_list(&verbose.1);

    if distros.is_empty() {
        return WslState {
            status: STATUS_NO_DISTRO.into(),
            platform: platform.into(),
            distros: vec![],
            default_distro: None,
            hint: Some("WSL 已启用但未安装发行版。可运行 \"wsl --install -d Ubuntu\" 安装。".into()),
        };
    }

    WslState {
        status: STATUS_READY.into(),
        platform: platform.into(),
        distros,
        default_distro,
        hint: None,
    }
}

/// 解析 `wsl --list --verbose` 输出，`*` 标记默认发行版。
fn parse_distro_list(text: &str) -> (Vec<Distro>, Option<String>) {
    let mut distros = Vec::new();
    let mut default_distro = None;
    for raw in text.lines() {
        let was_default = raw.trim_start().starts_with('*');
        let cleaned = raw.trim_start_matches('*').trim();
        if cleaned.is_empty() {
            continue;
        }
        if cleaned.eq_ignore_ascii_case("NAME STATE VERSION") {
            continue;
        }
        let parts: Vec<&str> = cleaned.split_whitespace().collect();
        if parts.is_empty() || parts[0].chars().all(|c| c == '-') {
            continue;
        }
        let name = parts[0].to_string();
        let state = parts.get(1).unwrap_or(&"Unknown").to_string();
        let version = parts.get(2).unwrap_or(&"").to_string();
        if was_default {
            default_distro = Some(name.clone());
        }
        distros.push(Distro {
            name,
            state,
            version,
            is_default: was_default,
        });
    }
    (distros, default_distro)
}

/// 触发 WSL 安装。需管理员权限；成功后通常需重启。
pub fn install() -> InstallResult {
    if !is_windows() {
        return InstallResult {
            triggered: false,
            needs_reboot: false,
            message: "非 Windows 平台，无法安装 WSL。".into(),
        };
    }
    let (code, _out, err) = run_wsl(&["--install"]);
    if code == 0 {
        InstallResult {
            triggered: true,
            needs_reboot: true,
            message: "已触发 WSL 安装，请重启系统后重试。".into(),
        }
    } else {
        InstallResult {
            triggered: false,
            needs_reboot: false,
            message: format!("WSL 安装失败：{}（可能需要以管理员身份运行）", err),
        }
    }
}

/// 在指定发行版内执行 shell 命令。返回子进程句柄（用于停止）。
/// 这里以 spawn 方式保留句柄，使调用方能 kill。
pub fn spawn_in_distro(distro: &str, command: &str) -> Option<Child> {
    if !is_windows() {
        return None;
    }
    Command::new("wsl")
        .args(["-d", distro, "--", "bash", "-lc", command])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .ok()
}

/// 在指定发行版内同步执行命令并返回输出（用于检测/安装阶段）。
pub fn exec_in_distro(distro: &str, command: &str) -> (i32, String, String) {
    if !is_windows() {
        return (-1, String::new(), "WSL is only supported on Windows".into());
    }
    let output = Command::new("wsl")
        .args(["-d", distro, "--", "bash", "-lc", command])
        .output();
    match output {
        Ok(o) => (
            o.status.code().unwrap_or(-1),
            String::from_utf8_lossy(&o.stdout).to_string(),
            String::from_utf8_lossy(&o.stderr).to_string(),
        ),
        Err(e) => (-1, String::new(), e.to_string()),
    }
}

/// 进程注册表：service_id -> child。
/// 使用 Mutex 保护；停止时 kill 对应进程。
pub struct ProcessRegistry {
    inner: std::sync::Mutex<HashMap<String, Child>>,
}

impl ProcessRegistry {
    pub fn new() -> Self {
        Self {
            inner: std::sync::Mutex::new(HashMap::new()),
        }
    }

    pub fn register(&self, id: &str, child: Child) {
        let mut g = self.inner.lock().unwrap();
        g.insert(id.to_string(), child);
    }

    pub fn stop(&self, id: &str) -> bool {
        let mut g = self.inner.lock().unwrap();
        if let Some(mut child) = g.remove(id) {
            let _ = child.kill();
            let _ = child.wait();
            true
        } else {
            false
        }
    }

    pub fn has(&self, id: &str) -> bool {
        let g = self.inner.lock().unwrap();
        g.contains_key(id)
    }
}

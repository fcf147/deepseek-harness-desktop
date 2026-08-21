# WebUI Shell — 通用本地 AI 服务桌面壳

## 项目简介

WebUI Shell 是一个基于 Tauri 2.x 构建的轻量级桌面应用，用于将 Linux/WSL 环境中运行的各类 AI WebUI 服务（DeepSeek Harness、Ollama、ComfyUI、Open WebUI 等）统一收纳到一个窗口中，提供一键环境检测、自动安装、服务启停和界面嵌入能力。用户无需手动配置 WSL、Node.js 或各类服务依赖，安装桌面壳后即可通过可视化界面完成全部操作。

---

## 架构设计

### 整体架构图


+-----------------------------------------------------------+
WebUI Shell (Tauri 2.x)

+------------------+  +----------------+  +--------------+

服务侧边栏 WebView 面板 状态/日志面板
|
(YAML 驱动) (嵌入 WebUI (安装进度/
|
或自绘 UI) 健康检查)
|
+------------------+  +----------------+  +--------------+

^

v

+-----------------------------------------------------+

Rust 后端 (核心逻辑)

+---------------+  +----------------+

WSL 管理器 通用 HTTP 代理

检测/安装/启停 (CORS 绕过)

+---------------+  +----------------+

+---------------+  +----------------+

进程管理器 端口健康检查

(启/停子进程) (轮询检测)

+---------------+  +----------------+

+-----------------------------------------------------+
+-----------------------------------------------------------+

                            v
+-----------------------------------------------------------+
Windows Host + WSL2

+------------------------------------------------------+

WSL Distro (Ubuntu)

+----------------+  +-----------+  +------------+

DeepSeek Ollama 其他服务

Harness :3080 :11434 (可扩展)

+--------+-------+  +-----------+  +------------+

localhost 端口自动映射到 Windows

+-----------+------------------------------------------+

Windows localhost:3080 <-- WebView 直接加载

+-----------------------------------------------------------+


### 技术选型

| 层级 | 技术 | 说明 |
|------|------|------|
| 桌面框架 | Tauri 2.x (Rust + 系统 WebView) | 包体积 2-5 MB，内存占用低，使用系统 WebKitGTK/WebView2 |
| 前端框架 | Vite + React + TypeScript | 快速开发，生态成熟 |
| 后端语言 | Rust | 系统级交互（进程管理、网络检测、文件操作）安全可靠 |
| 配置格式 | services.yaml | 声明式服务配置，新增服务无需修改代码 |
| 目标平台 | Windows 10/11 x64（第一版） | 后续可扩展 macOS / Linux 原生版本 |
| 打包格式 | MSI / EXE (NSIS) | 支持自动更新 |

### 为什么选 Tauri 而非 Electron

| 维度 | Tauri 2.x | Electron |
|------|-----------|----------|
| 安装包体积 | 2-5 MB | 70-150 MB |
| 运行时内存 | 50-100 MB | 300-600 MB |
| 渲染引擎 | 系统 WebView (WebKitGTK / WebView2) | 内置 Chromium |
| 本地能力 | Rust 原生系统调用 | Node.js 主进程 |
| 适合场景 | 轻量壳应用、工具类桌面端 | 复杂跨平台应用 |

---

## 核心功能

### 1. 服务配置化驱动

所有对接的 AI 服务通过 `services.yaml` 声明，壳启动时动态加载服务列表：

yaml
services:
  deepseek_harness:
    label: "DeepSeek Harness"
    mode: webview_embed
    base_url: "http://127.0.0.1:3080"
    ui_path: "/"
    health: "http://127.0.0.1:3080/"
    install:
      type: wsl_script
      script_url: "https://cdn.example.com/bootstrap-dsh.sh"
    autostart:
      cmd: "dsh web --port 3080"
    depends_on: ["wsl"]

  ollama:
    label: "Ollama"
    mode: api_proxy
    base_url: "http://127.0.0.1:11434"
    api_prefix: "/api"
    health: "http://127.0.0.1:11434/api/tags"
    install:
      type: wsl_native
      package: "ollama"

  comfyui:
    label: "ComfyUI"
    mode: webview_embed
    base_url: "http://127.0.0.1:8188"
    ui_path: "/"
    health: "http://127.0.0.1:8188/system/stats"


每个服务支持两种展示模式：
- **webview_embed**：WebView 直接加载服务自带 Web UI（适用于 DSH、ComfyUI 等自带界面的服务）
- **api_proxy**：壳内通过 Rust 后端反向代理 API 请求，前端自绘交互界面（适用于 Ollama 等无官方 UI 的服务）

### 2. WSL 环境自动管理

针对 DeepSeek Harness 等服务需要运行在 Linux 环境的场景，壳内置完整的 WSL 生命周期管理：

| 步骤 | 行为 | 说明 |
|------|------|------|
| 检测 | 执行 `wsl --status` 检查 WSL 是否安装 | 同时检测已安装的发行版列表 |
| 安装 | 未安装时通过管理员权限触发 `wsl --install` | 弹窗引导用户完成安装和重启 |
| 验证 | 确认默认发行版可用（推荐 Ubuntu 22.04 LTS） | 不支持的发行版给出提示 |
| 就绪 | 标记 WSL 环境可用，进入服务安装阶段 | 状态持久化到本地配置 |

### 3. 一键安装服务

对于 WSL 内未安装的服务，壳提供一键安装能力：

- 点击安装按钮后，壳通过 `wsl -e bash -c "curl -fsSL <script_url> | bash"` 执行远程引导脚本
- 脚本输出实时流式传输到桌面壳的日志面板，用户可直观看到安装进度
- 安装完成后自动进入启动流程

引导脚本示例（bootstrap-dsh.sh）：

bash
!/usr/bin/env bash

set -e

echo "==> 检测 Linux 发行版..."
if [ -f /etc/os-release ]; then
  . /etc/os-release
  DISTRO=$ID
fi

echo "==> 安装 Node.js 20.x..."
case $DISTRO in
  ubuntu|debian)
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get update && apt-get install -y nodejs
    ;;
  fedora)
    dnf install -y nodejs npm
    ;;
  *)
    echo "不支持的发行版: $DISTRO，请手动安装 Node.js 20+" >&2
    exit 1
    ;;
esac

echo "==> 安装 DeepSeek Harness..."
npm install -g @deepseek-ai/dsh@0.1.0

echo "==> 验证安装..."
dsh --version

echo "==> 安装完成"


### 4. 服务启停与端口检测

- 启动：通过 `wsl -d <distro> -e <command>` 在 WSL 中启动服务进程
- 健康检查：定时轮询 `base_url` 的 `health` 端点，更新侧边栏服务状态指示灯
- 停止：关闭壳时自动终止关联的 WSL 子进程（可选切换为后台常驻模式）
- 端口映射：WSL2 默认将 Linux 侧监听的端口自动转发至 Windows `localhost`，WebView 直接加载对应地址

### 5. CORS 代理（API 模式服务）

对于需要自绘 UI 的服务（如 Ollama），壳内提供 Rust 侧通用 HTTP 反向代理，绕过浏览器同源策略限制：

rust
[tauri::command]

async fn proxy(url: String, method: Option<String>, body: Option<String>) -> Result<String, String> {
    let client = reqwest::Client::new();
    let m = method.unwrap_or_else(|| "GET".into());
    let mut req = match m.as_str() {
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        _ => client.get(&url),
    };
    if let Some(b) = body {
        req = req.header("Content-Type", "application/json").body(b);
    }
    let resp = req.send().await.map_err(e
 e.to_string())?;
    resp.text().await.map_err(e
 e.to_string())
}


前端统一封装：

typescript
export async function callServiceAPI(serviceKey: string, path: string, opts?: RequestInit) {
  const service = servicesConfig[serviceKey];
  if ((window as any).__TAURI__) {
    return JSON.parse(await invoke("proxy", {
      url: ${service.base_url}${path},
      method: opts?.method ?? "GET",
      body: opts?.body,
    }));
  }
  return fetch(${service.base_url}${path}, opts).then(r => r.json());
}


---

## 用户使用流程


打开 WebUI Shell
  
+-> 首次启动：检测 WSL 环境

+-> 未安装 WSL -> 引导用户以管理员身份安装 -> 提示重启系统
+-> 已安装 WSL -> 进入服务列表

+-> 服务列表页：左侧显示所有已配置服务及其状态

+-> DeepSeek Harness (灰色/未安装)

+-> 点击 -> 右侧面板显示安装说明和 [一键安装] 按钮

+-> 点击安装 -> 执行 WSL 引导脚本 -> 实时日志流

+-> 安装完成 -> 自动启动 dsh web --port 3080

+-> 端口健康检查通过 -> WebView 加载 http://127.0.0.1:3080

+-> 用户直接在壳内使用 DeepSeek Harness

+-> 后续启动：自动检测服务状态

         +-> 已安装但未运行 -> 显示 [启动] 按钮 -> 点击即启动
         +-> 运行中 -> WebView 直接展示服务界面
         +-> 异常 -> 显示错误信息 + [重试/重启 WSL] 按钮


---

## 项目结构


webui-shell/
├── src/                        # 前端 (Vite + React + TS)
│   ├── components/
│   │   ├── Sidebar/            # 服务侧边栏
│   │   ├── WebViewPanel/       # WebView 嵌入面板
│   │   ├── LogPanel/           # 安装日志流面板
│   │   └── StatusBadge/        # 服务状态指示灯
│   ├── pages/
│   │   ├── ServiceList.tsx     # 服务列表页
│   │   └── ServiceDetail.tsx   # 服务详情/操作页
│   ├── api/
│   │   ├── proxy.ts            # Tauri proxy command 封装
│   │   └── wsl.ts              # WSL 管理命令封装
│   ├── config/
│   │   └── services.ts         # services.yaml 加载与解析
│   └── App.tsx
├── src-tauri/                  # Rust 后端
│   ├── src/
│   │   ├── main.rs             # 入口
│   │   ├── wsl.rs              # WSL 检测/安装/进程管理
│   │   ├── proxy.rs            # HTTP 反向代理 command
│   │   ├── health.rs           # 端口健康检查
│   │   └── commands.rs         # Tauri command 注册
│   ├── Cargo.toml
│   └── tauri.conf.json
├── scripts/
│   └── bootstrap-dsh.sh        # DSH WSL 安装引导脚本
├── config/
│   └── services.yaml           # 服务声明配置
├── package.json
├── vite.config.ts
└── README.md


---

## 开发指南

### 环境准备

- Node.js 18+
- Rust 1.75+
- Windows 10/11（开发机需支持 WSL2）
- Tauri CLI：`cargo install tauri-cli`

### 本地开发

bash
安装前端依赖

npm install

启动开发模式（前端 HMR + Tauri 窗口）

npm run tauri dev

构建生产版本

npm run tauri build


### 添加新服务

1. 在 `config/services.yaml` 中添加服务声明
2. 如服务需要自绘 UI，在 `src/api/proxy.ts` 基础上编写对应 adapter
3. 如服务需要 WSL 内安装，编写对应的 bootstrap 脚本放入 `scripts/`
4. 重新启动壳即可看到新服务出现在侧边栏

---

## 已知限制与注意事项

| 项目 | 说明 |
|------|------|
| WSL 安装需重启 | `wsl --install` 执行后必须重启 Windows，壳会检测并提示用户 |
| 端口转发断连 | Windows 休眠/唤醒后 WSL 端口转发可能中断，需通过 `wsl --shutdown` 恢复 |
| VPN 干扰 | 部分 VPN 软件会劫持 localhost 流量，导致 WebView 无法访问 WSL 服务 |
| 发行版支持 | 第一版仅正式支持 Ubuntu / Debian 系发行版，Fedora 等需社区验证 |
| dsh 版本锁定 | 建议锁定 DeepSeek Harness 版本号，避免上游 CLI 变更导致壳功能异常 |

---

## 后续规划

- 支持纯 Linux 桌面原生版本（移除 WSL 层，直接管理系统进程）
- 支持 macOS 版本（通过 Homebrew 管理服务依赖）
- 服务间联动配置（如 Ollama 提供模型 → DSH 调用）
- 团队配置共享（导出/导入 services.yaml）
- 插件市场（社区贡献服务配置 + 安装脚本）
- 自动更新机制（壳版本 + 服务版本独立更新）

---

## License

[待定]


这份 README 覆盖了从架构、功能、用户流程到开发指南的完整信息，小组看完能直接对齐技术方向和排期。拿去用就好，有需要改的地方随时说。
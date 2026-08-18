# Release 说明 — DeepSeek Harness 桌面版 0.1.2

> 面向 Gitee Release 页的发布说明。发布时需同时上传 **两个文件**（Windows）：

| 文件 | 大小 | 说明 |
| --- | --- | --- |
| `DeepSeek Harness-0.1.2-win-setup.exe` | ~78 MB | 安装包（< 100MB）：Electron 壳 + 应用代码 + profile 模板 + 7za 解压工具 |
| `dsh-runtime.7z` | ~70 MB | 运行时归档：内置 Node.js v22.19.0 + dsh 生产依赖闭包（含 6 个默认插件 + Windows 平台原生模块） |

**两个文件必须放在同一目录**，安装程序会在安装时自动用内置 7za 把归档解压到 `resources\runtime\`。安装前请先校验 sha256（见文末），exe 与 7z 必须来自同一 Release。

---

## 更新内容

### 🆕 默认启用 WSL 工作区（`dsh-wsl-workspace`）

- **VS Code Remote-WSL 风格**：侧边栏底部 Settings 旁出现 **W 按钮**，点击可添加 WSL 发行版工作区；整个 agent 会话（**bash 命令 + 文件读写**）直接在 WSL 内运行，**无需在 WSL 里安装 sshd / 工具链**。
- **解决 SSH 插件连 WSL 的文件管理痛点**：文件工具改走 Windows 侧 WSL 9P 共享（不再经过 SSH/SFTP 与本地镜像同步），bash 直接调 `wsl.exe`；Windows 文件仍可从会话内以 `/mnt/<drive>` 访问。
- 默认启用共 **6 个第三方插件**：`dsh-remote`、`dshmarket`、`dsh-message-edit`、`@dsh-external/dsh-vision-toolkit`、`dsh-memory-evolve`、`dsh-wsl-workspace`。

### 🔧 升级安装：自动卸载旧版本再安装新版本

- **修复升级流程**：electron-builder 默认「覆盖安装」，旧版产物若来自不同构建环境（Windows 构建的旧包 vs Linux 交叉构建的新包）会覆盖失败，需手动卸载后才能安装。
- **安装器现在自动完成**（`preInit` 阶段，写文件前）：① 结束旧进程；② 枚举注册表（HKCU + HKLM）定位旧版；③ 静默运行旧版卸载器（`Uninstall DeepSeek Harness.exe /S`，复制到临时目录、`_?=` 防自删）等待完成；④ 再全新安装。全新安装不受影响。

### 🔧 构建与运行时修复（Linux 交叉构建）

- **Linux 构建机可完整交叉构建 Windows 安装包**（无需 wine）：归档 7za 按宿主平台选择、pnpm 以宿主 npm 包装成 Windows shim（`pnpm.cmd`/`pnpm.ps1`）。
- **Windows 平台原生模块版本对齐**：koffi 3.1.5、sharp、node-addon-require-builtin 等平台包按 runtime 主包版本对齐（`Mismatched native Koffi modules` 修复）；归档无符号链接（Windows 解压不再失败）。
- `prepare-runtime` Node 就绪检测修复（避免重复下载 Node，离线可复用）；`dsh-memory-evolve` 跳过 tsdown workspace 构建。
- 移除失效的 `mcp-sqlite` 预置（官方 MCP servers 无该 npm 包，`npx` 拉取 404）。

### 🚀 新增

- 一键发布构建脚本 `scripts/build-release.mjs`（`--version` 控制版本号并自动同步 3 处 version 字段、`--mirror` 国内镜像、自动生成 `sha256sums.txt`）。

## 这是什么

DeepSeek Harness 的**桌面发行版**：Electron 壳 + 内置免安装 Node.js 运行时 + 预组装 dsh 安装根，**用户无需自行安装 Node.js**，双击即用。开箱即用并**默认启用 6 个第三方插件**，配套 HarmonyOS ArkWeb 客户端。

- 上游：DeepSeek Harness（`@deepseek-ai/dsh-root`，MIT）
- 桌面壳：Electron 33 + electron-builder（Windows NSIS）
- 内置运行时：Node.js v22.19.0（免安装）+ dsh 生产依赖闭包（hoisted 布局）
- 默认 profile：`web`（dsh-base + dsh-web-app）

## 主要特性

- **免装 Node.js**：内置 `runtime/node` 与 `runtime/dsh` 完整闭包，安装即用。
- **默认启用 6 个第三方插件**（web profile 挂载）：
  - `dsh-remote`：SSH 远程开发（多机注册、远程工作区、面向模型的 `rw_*` 工具）。
  - `dshmarket`：可视化插件市场。
  - `dsh-message-edit`：分支式消息编辑（reroll / 重试 / 版本时间线）。
  - `@dsh-external/dsh-vision-toolkit`：图像问答、OCR、界面还原、像素级对比。
  - `dsh-memory-evolve`：跨会话长期记忆与后台自我进化。
  - `dsh-wsl-workspace`：WSL 工作区（bash + 文件工具直接在 WSL 发行版内运行）。
- **跨端**：同一 `dsh web:` 服务既可在桌面应用内使用，也可被 `harmony/`（HarmonyOS 客户端）连接。
- **独立用户数据**：`%APPDATA%\dsh-desktop\home`（Windows），与已有 CLI 的 `~/.dsh` 互不干扰。

## 安装与升级

1. 下载 **两个文件** 到同一目录。
2. 运行 `DeepSeek Harness-0.1.2-win-setup.exe`：
   - **升级**：安装器自动结束旧进程并静默卸载旧版本，然后全新安装新版本（无需手动卸载）。
   - **全新安装**：直接安装。
3. 首次启动自动初始化用户数据目录并拉起 `dsh web` 服务。
4. WSL 用户点侧边栏 **W 按钮** 添加 WSL 工作区。

## 校验和（SHA256）

见随包 `sha256sums.txt`：

```
5c202e2f7b84a6fa88b937bab44b164d202ed3594acaf7174dd366d98b2c3b4b  DeepSeek Harness-0.1.2-win-setup.exe
5c88649db61c6ae8b73e4db8ea98ec0df4a9c91fffbd4c195151b0a93bd83f9c  dsh-runtime.7z
```

校验命令：

```bash
# Linux / macOS
sha256sum -c sha256sums.txt
# Windows PowerShell（与 sha256sums.txt 中对应行比对）
Get-FileHash '.\DeepSeek Harness-0.1.2-win-setup.exe' -Algorithm SHA256
Get-FileHash '.\dsh-runtime.7z' -Algorithm SHA256
```

哈希不一致请勿安装，并在 Gitee Issues 反馈。

## 已知限制

- 未做代码签名（Windows SmartScreen 会提示）。
- 仅 Windows x64；Linux 用 rpm 全量包（无拆分）。
- WSL 工作区的文件工具受 DSH 文件策略约束：`workspace-write` 下写操作限会话工作区内；需写工作区外（如 `/mnt/c`）请将文件策略切到 `danger-full-access`。

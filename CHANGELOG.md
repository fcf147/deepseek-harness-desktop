# Changelog

## [0.1.0] - 2026-08-16

首次开源发布。

### Added

- Electron 桌面壳（Windows NSIS 安装包 / Linux rpm），内置免安装 Node.js v22.19.0 与 `dsh` 生产依赖闭包，用户无需安装 Node.js。
- Web profile 默认启用 5 个第三方插件：
  - `dsh-remote`：SSH 远程开发（远程工作台、远程工作区标签页、模型 `rw_*` 工具）。
  - `dshmarket`：可视化插件市场（浏览 / 搜索 / 一键安装 / 已装管理）。
  - `dsh-message-edit`：分支式消息编辑（reroll / 重试 / 版本时间线）。
  - `@dsh-external/dsh-vision-toolkit`：图像问答、OCR、定位、界面还原、像素级对比。
  - `dsh-memory-evolve`：跨会话长期记忆与后台自我进化（自 GitHub 安装，钉在提交 `ce7f0faa`）。
- 对官方仓库的补丁集（`patches/desktop-runtime.patch`）：5 个插件默认启用、peer 范围放宽、ssh2 构建放行、`minimumReleaseAgeExclude`。
- HarmonyOS ArkWeb 客户端（`harmony/`），连接桌面端 `dsh web` 服务。
- 一键构建脚本 `scripts/build.mjs` 与运行时装配脚本 `scripts/prepare-runtime.mjs`（幂等、支持镜像/离线复用）。

### Changed

- 运行时以 hoisted 布局扁平化（`--config.node-linker=hoisted`），使 profile 模块回退目录可解析完整闭包。
- deploy 放行子依赖中的 git 包（`--config.blockExoticSubdeps=false`），支持 `dsh-memory-evolve` 的 git 安装。
- 还原仓库 `link:` override 的 vendored 包（`@deepseek-ai/cosmokit`、`@deepseek-ai/schemastery`）。
- **Windows 拆分发布**：安装包控制在 100MB 以内（实测 ~78MB）。体积大头（内置 Node ~94MB + dsh 运行时 ~266MB）压缩为独立归档 `dsh-runtime.7z`（~57MB），与安装包同目录发布；安装时由 `installer.nsh` 的 `customInstall` 用内置 7za 解压到 `resources\runtime\`。新增 `tools/7za.exe` 随包分发，`build.mjs` 增加归档生成步骤，win 与 linux 的 `extraResources` 按平台区分。

### Fixed

- 修复托盘无法重新打开主窗口：窗口关闭后 `mainWindow` 置空，托盘「打开」/单击图标改为 `showMainWindow()`——窗口已存在则聚焦，已被关闭则按保存的 `webUrl` 重建窗口（dsh web 服务驻留后台不受影响）。
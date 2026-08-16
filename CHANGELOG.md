# Changelog

## [0.1.0] - 2026-08-16

首次开源发布。

### Added

- Electron 桌面壳（Windows NSIS 安装包 / Linux rpm），内置免安装 Node.js v22.19.0 与 `dsh` 生产依赖闭包，用户无需安装 Node.js。
- Web profile 默认启用 SSH 远程开发（第三方 `dsh-remote` 插件）：远程工作台、远程工作区标签页、模型 `rw_*` 工具。
- 对官方仓库的补丁集（`patches/desktop-runtime.patch`）：dsh-remote 默认启用、peer 范围放宽、ssh2 构建放行。
- HarmonyOS ArkWeb 客户端（`harmony/`），连接桌面端 `dsh web` 服务。
- 一键构建脚本 `scripts/build.mjs` 与运行时装配脚本 `scripts/prepare-runtime.mjs`（幂等、支持镜像/离线复用）。

### Changed

- 运行时以 hoisted 布局扁平化（`--config.node-linker=hoisted`），使 profile 模块回退目录可解析完整闭包。
- 还原仓库 `link:` override 的 vendored 包（`@deepseek-ai/cosmokit`、`@deepseek-ai/schemastery`）。
# Third-Party Notices

本项目（DeepSeek Harness Desktop）是衍生作品，构建与运行依赖以下第三方组件。
本文件列出各组件出处与许可证；各组件的完整许可证文本见其各自的 LICENSE / 发布物。

## DeepSeek Harness (DSH)

- 项目：https://github.com/deepseek-ai/deepseek-harness
- 版本基线：`0.1.0-rc.8`（完整源码快照，见 `repo/deepseek-harness-master/`）
- 许可证：MIT
- 版权：Copyright (c) 2026 DeepSeek
- 用途：dsh 核心运行时、web profile、CLI；本项目在其上应用补丁并打包为桌面版

## Cordis

- 上游项目：https://github.com/shigma/cordis
- 本项目内形态：`vendor/cordis`（以 `@deepseek-ai/cordis` workspace 包随官方仓库 vendored）
- 许可证：MIT
- 版权：Copyright (c) 2021-present Shigma
- 用途：dsh 的插件宿主/依赖注入框架，被 dsh-base 及各插件依赖

## Electron

- 项目：https://github.com/electron/electron
- 版本：`^33.2.0`（见 `desktop/package.json`）
- 许可证：MIT
- 版权：Copyright (c) Electron contributors
- 用途：桌面壳（`desktop/`）的主进程/渲染进程运行时

## pnpm

- 项目：https://github.com/pnpm/pnpm
- 版本：`11.7.0`（`repo/deepseek-harness-master/package.json` 的 `packageManager` 字段）
- 许可证：MIT
- 版权：Copyright (c) Zoltan Kochan and pnpm contributors
- 用途：workspace 依赖安装、`pnpm deploy` 组装 dsh 运行时

## 其他运行时组件

本项目随包分发或引用的其他第三方软件（各为 MIT 或其他相应许可证）：

- **Node.js**（内置免安装运行时）：https://nodejs.org，版本 `v22.19.0`
- **7-Zip**（7za.exe，Windows 安装器解压归档用）：https://www.7-zip.org，LGPL-2.1-or-later 与 unRAR restriction（7-Zip 官方许可）

> 完整依赖清单与各包许可证见各发布产物的 lockfile（`pnpm-lock.yaml`、`desktop/package-lock.json`）及组件自带 LICENSE 文件。

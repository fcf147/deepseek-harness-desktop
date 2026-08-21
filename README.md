# WebUI Shell（deepseek-harness-desktop）

通用本地 AI 服务桌面壳。本仓库根即整个项目分支；当前活动分支 `webui-shell`
专注于 **Windows + WSL2** 后端，第一步仅对接 **DeepSeek Harness**。

## 仓库结构

```
deepseek-harness-desktop/          ← 仓库根（= 分支工作区）
├── desktop/                       ← 【当前重点】Tauri 2.x 桌面壳（Rust 后端 + React 前端）
│   ├── src/                       # 前端 (Vite + React + TS)
│   ├── src-tauri/                 # Rust 后端（WSL 管理 / 代理 / 健康检查）
│   ├── config/services.yaml       # 服务声明（第一步仅 deepseek_harness）
│   ├── scripts/bootstrap-dsh.sh   # WSL 内安装引导
│   └── docs/windows-dev.md        # Windows 开发构建指南
│
├── repo/deepseek-harness-master/  ← DeepSeek Harness 上游仓库副本（构建期依赖，非本项目源码）
├── release/deepseek-harness-desktop/ ← 旧 Electron 壳发布快照（master 分支遗留，与本分支方向无关）
├── harmony/                       ← 鸿蒙(ArkTS)壳快照（同上，独立平台）
├── scripts/ .tools/               ← 构建/工具辅助
├── .workbuddy/                    ← 本地工作记忆（已 gitignore，不入库）
├── README copy.md                 ← 设计目标文档（本分支的设计依据）
├── LICENSE / THIRD_PARTY_NOTICES.md
└── .gitignore / lefthook.yml
```

## 重点说明

- **桌面壳本体是 `desktop/`**：Tauri 2.x（Rust 主进程 + 系统 WebView），前端 React。
  详细设计与开发步骤见 `desktop/README.md` 与 `desktop/docs/windows-dev.md`。
- `repo/deepseek-harness-master/` 是上游 harness 的**整份副本**，原用于旧 Electron 壳
  本地拼装 dsh。对新的 Tauri 壳，它应作为外部依赖（submodule 或构建期拉取），
  而非平铺进源码树——当前为历史遗留，整理方案见下。
- `release/`、`harmony/` 为旧方案的发布/平台快照，与 `webui-shell` 的 Tauri 方向无关，
  属 `master` 分支旧物，后续可清理或另立分支。

## 当前分支待整理项（需确认）

1. `repo/` 上游副本是否转 submodule / 移出版本库；
2. `release/`、`harmony/` 旧快照是否删除（保留在 `master` 分支即可）。

> 设计文档正文见 `README copy.md`；桌面壳开发指南见 `desktop/docs/windows-dev.md`。

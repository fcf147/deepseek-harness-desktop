# patches/ — 对官方 deepseek-harness 仓库的修改

本目录在 rc.8 基线（本仓库 `yuanbanjiake` 分支）下**为空**：官方 `deepseek-harness` `0.1.0-rc.8` 的源码快照（`repo/deepseek-harness-master/`）已自洽，桌面版 `pnpm deploy` 可直接解析，无需任何补丁。

> 本仓库仅保留官方 harness + 桌面壳，不修改官方源码。

## 历史说明（rc.5 时期）

早期基于 rc.5 基线时，曾需要补丁 `desktop-runtime.patch`：在 `@deepseek-ai/dsh`（CLI 聚合包）的 `dependencies` 中补充 19 个 `@deepseek-ai/*` workspace 包，并放宽 `pnpm-workspace.yaml` 中 6 个 `@deepseek-ai/*` peer 范围。原因是桌面版以 `pnpm deploy` 只安装生产依赖，web profile 加载依赖「模块回退目录」按闭包创建符号链接，缺包会运行时 `Cannot find package`。升级到 rc.8 后官方已原生满足这些依赖，补丁废弃。

# patches/ — 对官方 deepseek-harness 仓库的修改

本目录存放让官方 deepseek-harness（基线 `0.1.0-rc.5`）能在**桌面版 hoisted 布局**下正常 `pnpm deploy`、安装与解析所需的修改。

> 本仓库（`yuanbanjiake` 分支）已移除全部第三方 / 自定义插件（`dsh-remote`、`dshmarket`、`dsh-message-edit`、`@dsh-external/dsh-vision-toolkit`、`dsh-memory-evolve`、`dsh-wsl-workspace`、`dsh-mcp-client`）与自定义 `summer-craft` 预设及其技能，仅保留官方 harness + 桌面壳。因此补丁集当前只含下面一项改动。

## 应用前提

- 官方仓库基线版本：`@deepseek-ai/dsh-root@0.1.0-rc.5`。

## 应用方法

在官方仓库根目录执行（需要 git）：

```bash
git apply ../deepseek-harness-desktop/patches/desktop-runtime.patch
```

之后请重新 `pnpm install`（补丁改动依赖图与 `pnpm-lock.yaml`），再 `pnpm run build`。

## 补丁内容

### 1. `apps/cli/package.json`

在 `@deepseek-ai/dsh`（CLI 聚合包）的 `dependencies` 中补充 19 个 `@deepseek-ai/*` workspace 包。

**为什么**：桌面版以 `pnpm deploy` 只安装生产依赖，web profile 加载依赖「模块回退目录」（`healProfilesModuleFallback`，见 `packages/boot/app-boot/src/profile.ts`）按闭包（dependencies + peerDependencies）创建符号链接。若某些包只存在于 peer/传递依赖图中、不在 CLI 的 dependencies 里，hoisted 布局下仍会缺失，运行时 `Cannot find package ...` 报错。把它们列进 CLI 依赖后闭包完整。

### 2. `pnpm-workspace.yaml`（直接修改仓库，不在此补丁内）

放宽 6 个 `@deepseek-ai/*` peer 范围（rc.6 → rc.5），让官方依赖在 rc.5 基线下可安装；升级到 rc.6 且原生支持后可移除。

## 更新说明

补丁由本仓库维护者生成（临时 git 仓库内提交基线后 `git diff --cached`，标准 `a/` `b/` 前缀，`git apply -p1` 应用）。若官方仓库演进导致上下文偏移，`git apply` 失败时可改用：

```bash
git apply --reject desktop-runtime.patch   # 冲突部分写入 .rej，手工合并
```

# patches/ — 对官方 deepseek-harness 仓库的修改

本目录存放让 **web profile 默认启用 SSH 远程开发（dsh-remote）** 并能在桌面版 hoisted 布局下正常安装、解析所需的全部修改。

## 应用前提

官方仓库基线版本：`@deepseek-ai/dsh-root@0.1.0-rc.5`。

## 应用方法

在官方仓库根目录执行（需要 git）：

```bash
git apply ../deepseek-harness-desktop/patches/desktop-runtime.patch
```

之后请重新 `pnpm install`（补丁改动依赖图与 `pnpm-lock.yaml`），再 `pnpm run build`。

## 补丁内容

### 1. `apps/cli/package.json`

在 `@deepseek-ai/dsh`（CLI 聚合包）的 `dependencies` 中补充 19 个 `@deepseek-ai/*` workspace 包。

**为什么**：桌面版以 `pnpm deploy` 只安装生产依赖，web profile 的插件加载依赖「模块回退目录」（`healProfilesModuleFallback`，见 `packages/boot/app-boot/src/profile.ts`）按闭包（dependencies + peerDependencies）创建符号链接。若某些包只存在于 peer/传递依赖图中、不在 CLI 的 dependencies 里，hoisted 布局下仍会缺失，运行时 `Cannot find package ...` 报错。把它们列进 CLI 依赖后闭包完整。

### 2. `packages/bundle/web-app/cordis.patch.yml`

在 web profile 的宿主行（host plane）中增加：

```yaml
- id: dsh-remote
  name: 'dsh-remote'
```

**为什么**：把第三方 `dsh-remote` 插件默认挂进 web profile。该插件注入系统提示词、`rw_*` 远程工具与 webServer 相关能力，位于 host 平面（与 API gateway 同级）。启动时 `host` 为空即未连接任何机器，在设置「远程工作台」添加机器后生效。

**如何关闭默认启用**：删除该行后重新构建。

### 3. `packages/bundle/web-app/package.json`

`dependencies` 增加 `"dsh-remote": "^0.5.4"`。dsh-remote 来自 npm registry（第三方插件，非官方仓库包）。

### 4. `pnpm-workspace.yaml`

- `peerDependencyRules.allowedVersions`：dsh-remote 0.5.x 声明 `@deepseek-ai/dsh-*` peer 范围为 `^0.1.0-rc.6`，本基线为 rc.5；其实际使用的 API（`defineTool`、`systemPrompt`、`webServer`）在 rc.5 已存在，故放宽为 `>=0.1.0-rc.5`，升级到 rc.6 后可移除。
- `allowBuilds`：放行 `ssh2` 与其可选原生加速 `cpu-features`（ssh2 的 install 脚本在无 C 编译器环境会跳过原生绑定并 exit 0，功能降级但可用）。

## 更新说明

补丁由本仓库维护者生成（`git diff --no-index`，`--no-prefix`，`-p1` 应用）。若官方仓库演进导致上下文偏移，`git apply` 失败时可改用：

```bash
git apply --reject desktop-runtime.patch   # 冲突部分写入 .rej，手工合并
```
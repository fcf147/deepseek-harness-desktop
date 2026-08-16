# patches/ — 对官方 deepseek-harness 仓库的修改

本目录存放让 **web profile 默认启用 5 个第三方插件**（SSH 远程开发 dsh-remote、插件市场 dshmarket、消息编辑 dsh-message-edit、视觉工具 @dsh-external/dsh-vision-toolkit、跨会话记忆 dsh-memory-evolve）并能在桌面版 hoisted 布局下正常安装、解析所需的全部修改。

## 应用前提

- 官方仓库基线版本：`@deepseek-ai/dsh-root@0.1.0-rc.5`。
- `dsh-memory-evolve` 以 git 依赖钉在提交 `ce7f0faa`，`pnpm install` 时需要可访问 github.com。

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

在 web profile 的宿主行（host plane）中增加 5 个第三方插件行：

```yaml
- id: dsh-remote
  name: 'dsh-remote'
- id: dsh-market
  name: 'dshmarket'
- id: message-edit
  name: 'dsh-message-edit'
- id: vision-toolkit
  name: '@dsh-external/dsh-vision-toolkit'
- id: dsh-memory-evolve
  name: 'dsh-memory-evolve'
```

**为什么**：
- `dsh-remote`（npm）把第三方 SSH 远程开发插件默认挂进 web profile，注入系统提示词、`rw_*` 远程工具与 webServer 相关能力，位于 host 平面（与 API gateway 同级）。启动时 `host` 为空即未连接任何机器，在设置「远程工作台」添加机器后生效。
- `dsh-market`（npm 包名 `dshmarket`）提供可视化插件市场侧边栏（浏览 / 搜索 / 一键安装 / 已装管理）。
- `message-edit`（npm 包名 `dsh-message-edit`）提供分支式消息编辑、reroll、重试与版本时间线。
- `vision-toolkit`（npm 包名 `@dsh-external/dsh-vision-toolkit`）提供图像问答、OCR、定位、界面还原、像素级对比；其 vendored agent-vision-toolkit 运行时按需获取，不可用时自动降级。
- `dsh-memory-evolve`（仅发布在 GitHub，git 依赖钉在提交 `ce7f0faa`）提供跨会话长期记忆与后台自我进化。

**如何关闭默认启用**：删除对应行后重新构建。

### 3. `packages/bundle/web-app/package.json`

`dependencies` 增加：

```json
"dsh-remote": "^0.5.4",
"@dsh-external/dsh-vision-toolkit": "^0.1.4",
"dsh-memory-evolve": "github:dsh-external/dsh-memory-evolve#ce7f0faa0e0240f117c29795e9224c0d9ed18183",
"dsh-message-edit": "^0.2.2",
"dshmarket": "^1.9.0"
```

其中 `dsh-remote`、`@dsh-external/dsh-vision-toolkit`、`dsh-message-edit`、`dshmarket` 来自 npm registry；`dsh-memory-evolve` 来自 GitHub（其包 `private: true`，未发布到 npm），故以 git 依赖钉在提交。

### 4. `pnpm-workspace.yaml`

- `peerDependencyRules.allowedVersions`：dsh-remote 0.5.x 声明 `@deepseek-ai/dsh-*` peer 范围为 `^0.1.0-rc.6`，本基线为 rc.5；其实际使用的 API（`defineTool`、`systemPrompt`、`webServer`）在 rc.5 已存在，故放宽为 `>=0.1.0-rc.5`，升级到 rc.6 后可移除。
- `allowBuilds`：放行 `ssh2` 与其可选原生加速 `cpu-features`（ssh2 的 install 脚本在无 C 编译器环境会跳过原生绑定并 exit 0，功能降级但可用）。
- `minimumReleaseAgeExclude`：放行刚发布的 `dshmarket@1.9.0`（pnpm 发布年龄门禁自动加入）。

### 5. 桌面端配套（不在补丁内）

- `scripts/prepare-runtime.mjs` 的 `pnpm deploy` 需加 `--config.blockExoticSubdeps=false`：deploy 默认拒绝子依赖中的 git 包，而 `dsh-memory-evolve` 是 web-app 的子依赖（git 依赖），必须显式放行。

## 更新说明

补丁由本仓库维护者生成（临时 git 仓库内提交基线后 `git diff --cached`，标准 `a/` `b/` 前缀，`git apply -p1` 应用）。若官方仓库演进导致上下文偏移，`git apply` 失败时可改用：

```bash
git apply --reject desktop-runtime.patch   # 冲突部分写入 .rej，手工合并
```
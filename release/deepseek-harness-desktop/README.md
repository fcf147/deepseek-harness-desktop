# DeepSeek Harness 桌面版

DeepSeek Harness 的桌面发行版：Electron 壳 + 内置免安装 Node.js 运行时 + 预组装 `dsh` 安装根，**用户无需自行安装 Node.js**。开箱即用并**默认启用 5 个第三方插件**（SSH 远程开发 dsh-remote、插件市场 dshmarket、消息编辑 dsh-message-edit、视觉工具 @dsh-external/dsh-vision-toolkit、跨会话记忆 dsh-memory-evolve），配套 HarmonyOS ArkWeb 客户端。

- 上游：DeepSeek Harness（`@deepseek-ai/dsh-root`，MIT）
- 桌面壳：Electron 33 + electron-builder（Windows NSIS / Linux rpm）
- 内置运行时：Node.js v22 LTS（免安装）+ `dsh` 生产依赖闭包（hoisted 布局）
- 默认 profile：`web`（dsh-base + dsh-web-app），已注入 5 个第三方插件

## 特性

- **免装 Node.js**：安装包内置 `runtime/node/<platform>-<arch>` 与 `runtime/dsh` 完整闭包，双击即用。
- **默认启用 5 个第三方插件**（web profile 挂载）：
  - `dsh-remote`：SSH 远程开发。设置里的「远程工作台」多机 SSH 注册、工作区选择器中的远程标签页、面向模型的 `rw_*` 工具（`rw_connect`、`rw_exec`、`rw_read_file`、`rw_write_file`、`rw_sync` …）；启动时 `host` 为空，配置机器后即可连接。
  - `dshmarket`：可视化插件市场（浏览 / 搜索 / 猜你喜欢 / 一键安装 / 已装管理）。
  - `dsh-message-edit`：分支式消息编辑（reroll / 重试 / 版本时间线）。
  - `@dsh-external/dsh-vision-toolkit`：图像问答、OCR、定位、界面还原、像素级对比（agent-vision-toolkit）。
  - `dsh-memory-evolve`：跨会话长期记忆与后台自我进化（五轨记忆、技能、待办）；自 GitHub 安装并钉在提交 `1aca4c4`。
- **跨端**：同一 `dsh web:` 服务既可在桌面应用内使用，也可被 `harmony/`（HarmonyOS 客户端）连接。

## 目录结构

```
.
├── main.js                    # Electron 主进程：装载 web profile、管理子进程、打开窗口
├── package.json               # 桌面壳工程（electron / electron-builder 依赖）
├── electron-builder.yml       # 打包配置（win nsis / linux rpm，runtime 走 extraResources）
├── scripts/
│   ├── prepare-runtime.mjs    # 组装 runtime/：内置 Node + pnpm deploy dsh + profile 模板
│   └── build.mjs              # 一键构建：prepare-runtime -> electron-builder
├── patches/
│   ├── desktop-runtime.patch  # 对官方仓库的全部修改（统一 diff，git apply 即可）
│   └── README.md              # 补丁说明与应用步骤
├── assets/icon.png            # 应用图标
└── harmony/                   # HarmonyOS ArkWeb 客户端（连接 dsh web 服务）
```

## 快速开始（使用安装包）

Windows 为**拆分发布**，需要同时下载两个文件并放在同一目录：

1. 下载 `DeepSeek Harness-<version>-win-setup.exe`（< 100MB，只含 Electron 壳 + 应用代码 + profile 模板）。
2. 下载 `dsh-runtime.7z`（内置 Node + dsh 运行时归档，~57MB），与安装包放在同一目录。
3. 运行安装包：安装程序会用内置 7za 把归档解压到安装目录的 `resources\runtime\`；归档缺失时会中止并提示。
4. 启动应用，首次运行会初始化用户数据目录（Windows：`%APPDATA%\dsh-desktop\home`，Linux：`~/.config/dsh-desktop/home`）并启动 `dsh web` 服务；桌面版使用独立数据目录，不与已有 CLI 的 `~/.dsh` 互相干扰。
5. 在工作区选择器中选择本地或远程工作区（远程需先在「设置 → 远程工作台」添加机器）。
6. 如需在 HarmonyOS 设备上使用，安装 `harmony/` 客户端并填入桌面端显示的 `dsh web:` 地址。

> 升级应用版本时只需重新安装新的 exe，`dsh-runtime.7z` 通用（除非 Node/dsh 运行时本身升级）。

## 从源码构建（从零到 exe）

> 以下步骤在一台**干净的 Windows 或 Linux x64 机器**上从零开始，最终产出可安装的
> Windows 安装包（`*-win-setup.exe` + `dsh-runtime.7z`）。

### 0. 前置条件（仅构建机需要）

- **操作系统**：Windows 10/11 x64 或 Linux x64（红帽系可顺带出 rpm）
- **Node.js ≥ 22**（建议 22 LTS）与 **pnpm ≥ 10**：`npm install -g pnpm`（或 corepack 启用）
- **Git**（Windows 建议 Git for Windows；Linux 用系统包管理器）
- **网络**：可访问 npm registry、nodejs.org、GitHub（`dsh-memory-evolve` 经 GitHub 安装）、Electron 下载源；国内网络建议先看下方「网络镜像」一节

验证环境：

```bash
node --version   # v22.x
pnpm --version   # 10.x+
git --version
```

### 1. 克隆两个仓库（官方上游 + 本桌面壳仓库）

```bash
# 官方 DeepSeek Harness monorepo（基线 0.1.0-rc.5）
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
git checkout 0.1.0-rc.5   # 锁定基线版本（补丁基于 rc.5 生成）
cd ..

# 本仓库（桌面壳 + 补丁 + Harmony 客户端）
git clone https://gitee.com/summerwindow741/deepseek-harness-desktop.git
cd deepseek-harness-desktop
```

> 若上游无 `0.1.0-rc.5` tag（以 `git tag -l` 为准），可检出对应提交；补丁以 `git apply -p1` 应用，
> 上下文轻微偏移时可参照 `patches/README.md` 的 fuzz/手动合并说明。

### 2. 应用补丁到官方仓库

补丁让 web profile 默认启用 5 个第三方插件、放宽 peer 范围、放行 ssh2 构建等：

```bash
cd deepseek-harness
git apply ../deepseek-harness-desktop/patches/desktop-runtime.patch
# 若报错，先确认基线确为 0.1.0-rc.5；补丁说明见 patches/README.md
```

### 3. 构建官方仓库（产出 dsh CLI 产物）

```bash
pnpm install
pnpm run build
```

> `pnpm install` 会经 GitHub 安装 `dsh-memory-evolve`（钉在提交 `1aca4c4`），需可解析该提交（GitHub 不可达时用本地镜像）；
> `pnpm run build` 产出 `apps/cli/lib/bin.js` 等，供桌面壳 deploy 引用。

### 4. 安装桌面壳依赖

```bash
cd ../deepseek-harness-desktop
npm install
```

> `npm install` 会下载 Electron 二进制（约百 MB）。国内网络建议先设置 `ELECTRON_MIRROR`（见下节）。

### 5. 一键构建

```bash
# Windows：产出安装包 + 运行时归档（推荐在 Windows 上执行）
npm run build:win

# Linux rpm（可选，全量打包无拆分）：在 Linux 上执行
npm run build:linux
```

`build.mjs` 会自动完成：组装 runtime（复用/下载免安装 Node v22.19.0 → `pnpm deploy` dsh 安装根 → profile 模板）→ electron-builder 打包 → 压缩 `dsh-runtime.7z`。

### 6. 产物

位于 `dist/`：

- Windows：`dist/DeepSeek Harness-<version>-win-setup.exe`（< 100MB）+ `dist/dsh-runtime.7z`（~57MB）——**两个文件需同目录发布/安装**
- Linux：`dist/DeepSeek Harness-<version>-linux-x64.rpm`

### 网络镜像（可选，国内构建机推荐）

```bash
export NODE_MIRROR=https://npmmirror.com/mirrors/node
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
export ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
# Windows PowerShell：
# $env:NODE_MIRROR="https://npmmirror.com/mirrors/node"
# $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
# $env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
```

### 离线/复用构建机缓存

- `scripts/build.mjs` 会自动复用 `.tools/node-*`（已解压的免安装 Node）作为内置运行时，跳过下载。
- 已组装的 `runtime/` 与已构建的 `desktop/node_modules` 均幂等跳过（见 `prepare-runtime.mjs` 的 `isDshReady`）。

### 拆分发布说明（Windows）

`build.mjs` 在 electron-builder 打包后，用 7za（`desktop/node_modules/7zip-bin`）把 `runtime/node` + `runtime/dsh` 压缩为 `dist/dsh-runtime.7z`；`electron-builder.yml` 的 win `extraResources` 只带 `runtime/templates` 与 `tools/7za.exe`。安装时由 `installer.nsh` 的 `customInstall` 宏把归档解压到 `$INSTDIR\resources\runtime\`，main.js 的路径约定不变。

## 运行时装配说明

`prepare-runtime.mjs` 完成三件事：

1. **内置 Node**：下载/复用免安装 Node（v22.19.0，`DSH_DESKTOP_NODE_VERSION`/`NODE_MIRROR` 可覆盖）。
2. **dsh 安装根**：`pnpm --filter @deepseek-ai/dsh deploy --legacy --prod`，关键参数：
   - `--config.node-linker=hoisted`：扁平化顶层 node_modules。web profile 的模块回退目录（`healProfilesModuleFallback`）按字面路径解析闭包依赖，isolated 布局下嵌套传递依赖不可见。
   - `--config.auto-install-peers=false` / `--config.link-workspace-packages=true`。
   - `--config.blockExoticSubdeps=false`：放行子依赖中的 git 依赖（`dsh-memory-evolve` 仅发布在 GitHub，钉在固定提交）。
   - 还原 `link:` override 的 vendored 包（`@deepseek-ai/cosmokit`、`schemastery`），legacy deploy 不会自动落盘。
3. **profile 模板**：写入 `runtime/templates/profiles/web`（web-app bundle 已默认启用 5 个第三方插件）。

## 对官方仓库的修改

完整差异见 [`patches/desktop-runtime.patch`](patches/desktop-runtime.patch)：4 个源文件改动（外加 `web-app/README.md` 与 `README.zh.md` 两处文档同步）：

| 文件 | 改动 |
| --- | --- |
| `apps/cli/package.json` | 补充 19 个 `peerDependencies`，使 profile 闭包（heal 回退）可解析到所有依赖 |
| `packages/bundle/web-app/cordis.patch.yml` | web profile 增加 5 个第三方插件行（dsh-remote、dsh-market、message-edit、vision-toolkit、dsh-memory-evolve，默认启用） |
| `packages/bundle/web-app/package.json` | 增加 `dsh-remote@^0.5.4`、`dshmarket@^1.9.0`、`dsh-message-edit@^0.2.2`、`@dsh-external/dsh-vision-toolkit@^0.1.4`、`dsh-memory-evolve`（git 依赖，钉 `1aca4c4`） |
| `pnpm-workspace.yaml` | `peerDependencyRules.allowedVersions` 放宽 dsh-remote 对 rc.6 的 peer 范围；`allowBuilds` 放行 `ssh2`/`cpu-features`（ssh2 的可选加速绑定，构建失败时自动降级）；`minimumReleaseAgeExclude` 放行刚发布的 `dshmarket@1.9.0` |

> 注：5 个插件均为第三方（npm 或 GitHub，`dsh-memory-evolve` 仅发布在 GitHub 故钉在提交），不属于官方仓库；启用它们所需的最小 peer 范围放宽已写进 workspace 配置。若不想默认启用某插件，删除补丁中 `cordis.patch.yml` 的对应行即可。

## 常见问题

- **SSH 连接失败？** 确认目标机器已开 SSH，且本机有可用密钥/口令。`ssh2` 的原生加速（cpu-features）在本机无 C 编译器时会自动跳过，不影响功能。
- **视觉工具需要 Python 吗？** `@dsh-external/dsh-vision-toolkit` 首次使用图像能力时按需获取 agent-vision-toolkit 运行时；不可用时该插件自动降级，不影响其它功能。
- **能否自己指定 Node 版本？** 构建时 `DSH_DESKTOP_NODE_VERSION` 可覆盖内置版本，但需满足 dsh 的 `engines`（`^22.19.0 || >=24.0.0`）。
- **rpm 需要什么发行版？** 红帽系（Fedora/RHEL/openEuler 等）。

## 许可证

MIT，见 [LICENSE](LICENSE)。上游 DeepSeek Harness 为 MIT，桌面壳与补丁由本仓库贡献者编写。
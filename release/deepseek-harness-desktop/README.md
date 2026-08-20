# DeepSeek Harness 桌面版

DeepSeek Harness 的桌面发行版：Electron 壳 + 预组装 `dsh` 安装根，配套 HarmonyOS ArkWeb 客户端。**Node.js 按平台集成**——Windows 安装包内置最新合规 Node.js（安装期自动识别系统 Node 并静默补齐），Linux 使用系统 Node.js 并按发行版提示补全。仅打包官方 harness 默认能力。

- 上游：DeepSeek Harness（`@deepseek-ai/dsh-root`，MIT）
- 桌面壳：Electron 33 + electron-builder（Windows NSIS / Linux rpm）
- 内置运行时：**Windows** 内置最新满足 dsh engines（`^22.19.0 || >=24.0.0`）的 Node.js LTS（免安装）+ `dsh` 生产依赖闭包（hoisted 布局）；**Linux** 不内置 Node，使用系统 Node
- 默认 profile：`web`（dsh-base + dsh-web-app），仅官方默认能力

## 特性

- **Node.js 免操心（Windows）**：安装包内置 `runtime/node/win32-x64`，安装时自动识别系统 Node.js 状态——系统已装合规 Node 则静默复用（`.use-system-node` 标记），否则**后台静默补齐**（直接使用包内内置 Node，全程离线零交互），之后才安装 harness 本体。
- **Node.js 按发行版提示（Linux）**：rpm **不内置** Node 二进制；启动时检测系统 Node.js，缺失/版本不足按发行版（Debian/Ubuntu→apt、Fedora/RHEL→dnf、Arch→pacman 等）弹窗提示安装命令，重试直到可用。
- **跨端**：同一 `dsh web:` 服务既可在桌面应用内使用，也可被 `harmony/`（HarmonyOS 客户端）连接。

## 目录结构

```
.
├── main.js                    # Electron 主进程：装载 web profile、管理子进程、打开窗口
├── package.json               # 桌面壳工程（electron / electron-builder 依赖）
├── electron-builder.yml       # 打包配置（win nsis / linux rpm，runtime 走 extraResources）
├── scripts/
│   ├── prepare-runtime.mjs    # 组装 runtime/：内置 Node（Windows 动态解析最新合规 LTS）+ pnpm deploy dsh + profile 模板
│   └── build.mjs              # 一键构建：prepare-runtime -> electron-builder
├── patches/
│   ├── desktop-runtime.patch  # 历史补丁空壳（rc.8 基线无需对官方源码打补丁）
│   └── README.md              # 补丁说明与应用步骤
├── assets/icon.png            # 应用图标
└── harmony/                   # HarmonyOS ArkWeb 客户端（连接 dsh web 服务）
```

## 快速开始（使用安装包）

Windows 为**拆分发布**，需要同时下载两个文件并放在同一目录：

1. 下载 `DeepSeek Harness-<version>-win-setup.exe`（Electron 壳 + 应用代码 + profile 模板 + **内置 Node.js**）。
2. 下载 `dsh-runtime.7z`（dsh 运行时归档，~50MB，**不含 Node**），与安装包放在同一目录。
3. 运行安装包：安装程序先检测系统 Node.js——PATH 中 `node --version` 满足 `^22.19.0 || >=24.0.0` 时写 `.use-system-node` 标记复用系统 Node，否则静默使用包内内置 Node（后台补齐，离线零交互）；随后用内置 7za 把归档解压到安装目录的 `resources\runtime\`；归档缺失时会中止并提示。
4. 启动应用，首次运行会初始化用户数据目录（Windows：`%APPDATA%\dsh-desktop\home`，Linux：`~/.config/dsh-desktop/home`）并启动 `dsh web` 服务；桌面版使用独立数据目录，不与已有 CLI 的 `~/.dsh` 互相干扰。
5. 在工作区选择器中选择本地工作区。
6. 如需在 HarmonyOS 设备上使用，安装 `harmony/` 客户端并填入桌面端显示的 `dsh web:` 地址。

> 升级应用版本时只需重新安装新的 exe，`dsh-runtime.7z` 通用（除非 dsh 运行时本身升级）。Windows 内置 Node 版本随 nodejs.org 最新合规 LTS 动态更新，安装包因此需要随版本一起重新发布。

## 从源码构建（从零到 exe）

> 以下步骤在一台**干净的 Windows 或 Linux x64 机器**上从零开始，最终产出可安装的
> Windows 安装包（`*-win-setup.exe` + `dsh-runtime.7z`）。

### 0. 前置条件（仅构建机需要）

- **操作系统**：Windows 10/11 x64 或 Linux x64（红帽系可顺带出 rpm）
- **Node.js ≥ 22**（建议 22 LTS）与 **pnpm ≥ 10**：`npm install -g pnpm`（或 corepack 启用）
- **Git**（Windows 建议 Git for Windows；Linux 用系统包管理器）
- **网络**：可访问 npm registry、nodejs.org、Electron 下载源；国内网络建议先看下方「网络镜像」一节

验证环境：

```bash
node --version   # v22.x
pnpm --version   # 10.x+
git --version
```

### 1. 克隆两个仓库（官方上游 + 本桌面壳仓库）

```bash
# 官方 DeepSeek Harness monorepo（基线 0.1.0-rc.8）
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
git checkout dsh-v0.1.0-rc.8   # 锁定基线版本（最新发布 tag，完整源码树）
cd ..

# 本仓库（桌面壳 + 补丁 + Harmony 客户端）
git clone https://gitee.com/summerwindow741/deepseek-harness-desktop.git
cd deepseek-harness-desktop
```

> 锁定 `dsh-v0.1.0-rc.8` tag 即可。官方 `0.1.0-rc.8` 源码自洽（依赖闭包与 peer 范围均已满足），**无需对官方仓库打补丁**；本仓库 `patches/` 仅保留空壳以备追溯。

### 2. 核对基线（rc.8 无需补丁）

确认检出的官方仓库确为 `dsh-v0.1.0-rc.8`：

```bash
cd deepseek-harness
git describe --tags   # 预期：dsh-v0.1.0-rc.8
```

### 3. 构建官方仓库（产出 dsh CLI 产物）

```bash
pnpm install
pnpm run build
```

> `pnpm install` 解析官方依赖闭包（rc.8 已自洽，peer 无冲突）；
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

`build.mjs` 会自动完成：组装 runtime（Windows：动态解析最新合规 Node LTS → `pnpm deploy` dsh 安装根 → profile 模板；Linux：不内置 Node，只 deploy dsh + 模板）→ electron-builder 打包 → 压缩 `dsh-runtime.7z`（仅 dsh）。

### 6. 产物

位于 `dist/`：

- Windows：`dist/DeepSeek Harness-<version>-win-setup.exe`（含内置 Node）+ `dist/dsh-runtime.7z`（~50MB，仅 dsh）——**两个文件需同目录发布/安装**
- Linux：`dist/DeepSeek Harness-<version>-linux-x64.rpm`（**不含 Node**，依赖系统 Node.js）

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

- Windows 目标：`runtime/node/win32-x64` 已就绪时自动跳过下载（日志显示「Node 运行时已存在」）；也可用 `DSH_DESKTOP_NODE_VERSION` 固定版本。
- 已组装的 `runtime/` 与已构建的 `desktop/node_modules` 均幂等跳过（见 `prepare-runtime.mjs` 的 `isDshReady`）。

### 拆分发布说明（Windows）

`build.mjs` 在 electron-builder 打包后，用 7za（`desktop/node_modules/7zip-bin`）把 `runtime/dsh` 压缩为 `dist/dsh-runtime.7z`；`electron-builder.yml` 的 win `extraResources` 除 `runtime/templates` 与 `tools/7za.exe` 外，**额外打入 `runtime/node/win32-x64`（内置 Node 随安装包分发）**。安装时由 `installer.nsh` 的 `customInstall` 宏：先检测系统 Node.js（满足 `^22.19.0 || >=24.0.0` 则写 `.use-system-node` 标记复用，否则静默使用内置 Node），再把归档解压到 `$INSTDIR\resources\runtime\`；main.js 启动时做严格版本校验，系统 Node 不满足要求时自动回退内置 Node。

## 运行时装配说明

`prepare-runtime.mjs` 完成三件事：

1. **内置 Node（仅 Windows 等目标）**：构建时从 nodejs.org `index.json` 动态解析**最新满足 dsh engines（`^22.19.0 || >=24.0.0`）的 LTS** 下载免安装包（`DSH_DESKTOP_NODE_VERSION` 固定版本、`NODE_MIRROR` 换镜像）；linux 目标不内置 Node。
2. **dsh 安装根**：`pnpm --filter @deepseek-ai/dsh deploy --legacy --prod`，关键参数：
   - `--config.node-linker=hoisted`：扁平化顶层 node_modules。web profile 的模块回退目录（`healProfilesModuleFallback`）按字面路径解析闭包依赖，isolated 布局下嵌套传递依赖不可见。
   - `--config.auto-install-peers=false` / `--config.link-workspace-packages=true`。
   - `--config.blockExoticSubdeps=false`：放行子依赖中的非常规（git/非 registry）来源依赖。
   - 还原 `link:` override 的 vendored 包（`@deepseek-ai/cosmokit`、`schemastery`、`cordis-plugin-group`←`vendor/group`），legacy deploy 不会自动落盘；其中 `cordis-plugin-group` 是 `dsh-app-boot` 的 peer（`auto-install-peers=false` 不装），漏掉会 `ERR_MODULE_NOT_FOUND`。
3. **profile 模板**：写入 `runtime/templates/profiles/web`（官方 web profile）。

## 对官方仓库的修改

本分支（`yuanbanjiake`）**不修改官方 harness 源码**。`repo/deepseek-harness-master/` 即官方 `deepseek-harness` `0.1.0-rc.8` 的完整源码快照，官方依赖闭包与 peer 范围均已自洽，桌面版 `pnpm deploy` 可直接解析，**无需任何补丁**。`patches/` 目录仅保留历史空壳（`desktop-runtime.patch` 曾在 rc.5 时期补充 19 个 `@deepseek-ai/*` 依赖闭包 + 放宽 peer 范围，rc.8 已不再需要）。

> 对快照的唯一补充：`pnpm-workspace.yaml` 追加 `supportedArchitectures`（os: [current, win32]）——纯构建配置，允许 Linux 宿主交叉构建 Windows 目标时同时安装 win32 平台原生模块（koffi/sharp 等），否则 win32 产物装上 Windows 启动必崩。

> 注：本分支仅保留官方 harness + 桌面壳，未启用任何第三方 / 自定义插件。

## 常见问题

- **能否自己指定 Node 版本？** 构建时 `DSH_DESKTOP_NODE_VERSION` 可覆盖内置版本，但需满足 dsh 的 `engines`（`^22.19.0 || >=24.0.0`）。
- **rpm 需要什么发行版？** 红帽系（Fedora/RHEL/openEuler 等）。

## 许可证

MIT，见 [LICENSE](LICENSE)。上游 DeepSeek Harness 为 MIT，桌面壳与补丁由本仓库贡献者编写。
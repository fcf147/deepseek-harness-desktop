# DeepSeek Harness 桌面版

DeepSeek Harness 的桌面发行版：Electron 壳 + 内置免安装 Node.js 运行时 + 预组装 `dsh` 安装根，**用户无需自行安装 Node.js**。开箱即用，仅打包官方 harness 默认能力，配套 HarmonyOS ArkWeb 客户端。

- 上游：DeepSeek Harness（`@deepseek-ai/dsh-root`，MIT）
- 桌面壳：Electron 33 + electron-builder（Windows NSIS / Linux rpm）
- 内置运行时：Node.js v22 LTS（免安装）+ `dsh` 生产依赖闭包（hoisted 布局）
- 默认 profile：`web`（dsh-base + dsh-web-app），仅官方默认能力

## 特性

- **免装 Node.js**：安装包内置 `runtime/node/<platform>-<arch>` 与 `runtime/dsh` 完整闭包，双击即用。
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
│   ├── desktop-runtime.patch  # 历史补丁空壳（rc.8 基线无需对官方源码打补丁）
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
5. 在工作区选择器中选择本地工作区。
6. 如需在 HarmonyOS 设备上使用，安装 `harmony/` 客户端并填入桌面端显示的 `dsh web:` 地址。

> 升级应用版本时只需重新安装新的 exe，`dsh-runtime.7z` 通用（除非 Node/dsh 运行时本身升级）。

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
   - `--config.blockExoticSubdeps=false`：放行子依赖中的非常规（git/非 registry）来源依赖。
   - 还原 `link:` override 的 vendored 包（`@deepseek-ai/cosmokit`、`schemastery`），legacy deploy 不会自动落盘。
3. **profile 模板**：写入 `runtime/templates/profiles/web`（官方 web profile）。

## 对官方仓库的修改

本分支（`yuanbanjiake`）**不修改官方 harness 源码**。`repo/deepseek-harness-master/` 即官方 `deepseek-harness` `0.1.0-rc.8` 的完整源码快照，官方依赖闭包与 peer 范围均已自洽，桌面版 `pnpm deploy` 可直接解析，**无需任何补丁**。`patches/` 目录仅保留历史空壳（`desktop-runtime.patch` 曾在 rc.5 时期补充 19 个 `@deepseek-ai/*` 依赖闭包 + 放宽 peer 范围，rc.8 已不再需要）。

> 注：本分支仅保留官方 harness + 桌面壳，未启用任何第三方 / 自定义插件。

## 常见问题

- **能否自己指定 Node 版本？** 构建时 `DSH_DESKTOP_NODE_VERSION` 可覆盖内置版本，但需满足 dsh 的 `engines`（`^22.19.0 || >=24.0.0`）。
- **rpm 需要什么发行版？** 红帽系（Fedora/RHEL/openEuler 等）。

## 许可证

MIT，见 [LICENSE](LICENSE)。上游 DeepSeek Harness 为 MIT，桌面壳与补丁由本仓库贡献者编写。
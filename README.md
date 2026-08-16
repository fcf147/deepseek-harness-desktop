# DeepSeek Harness 桌面版

DeepSeek Harness 的桌面发行版：Electron 壳 + 内置免安装 Node.js 运行时 + 预组装 `dsh` 安装根，**用户无需自行安装 Node.js**。开箱即用并**默认启用 SSH 远程开发（dsh-remote）**，配套 HarmonyOS ArkWeb 客户端。

- 上游：DeepSeek Harness（`@deepseek-ai/dsh-root`，MIT）
- 桌面壳：Electron 33 + electron-builder（Windows NSIS / Linux rpm）
- 内置运行时：Node.js v22 LTS（免安装）+ `dsh` 生产依赖闭包（hoisted 布局）
- 默认 profile：`web`（dsh-base + dsh-web-app），已注入 dsh-remote 插件

## 特性

- **免装 Node.js**：安装包内置 `runtime/node/<platform>-<arch>` 与 `runtime/dsh` 完整闭包，双击即用。
- **SSH 远程开发默认启用**：web profile 挂载第三方 `dsh-remote` 插件，提供
  - 设置里的「远程工作台」多机 SSH 注册
  - 工作区选择器中的远程标签页
  - 面向模型的 `rw_*` 工具（`rw_connect`、`rw_exec`、`rw_read_file`、`rw_write_file`、`rw_sync` …）
  - 启动时 `host` 为空（未连接），在界面中配置机器后即可连接。
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

1. 下载并安装 `DeepSeek Harness-<version>-win-setup.exe`（Windows）。
2. 启动应用，首次运行会初始化用户数据目录（Windows：`%APPDATA%\dsh-desktop\home`，Linux：`~/.config/dsh-desktop/home`）并启动 `dsh web` 服务；桌面版使用独立数据目录，不与已有 CLI 的 `~/.dsh` 互相干扰。
3. 在工作区选择器中选择本地或远程工作区（远程需先在「设置 → 远程工作台」添加机器）。
4. 如需在 HarmonyOS 设备上使用，安装 `harmony/` 客户端并填入桌面端显示的 `dsh web:` 地址。

## 从源码构建

### 前置条件（仅构建机）

- Windows 或 Linux x64 构建机
- Node.js ≥ 22 与 pnpm ≥ 10
- git（应用补丁用）
- 构建机可联网（下载免安装 Node 与 Electron 二进制）

### 步骤

```bash
# 1. 获取官方仓库源码（deepseek-harness monorepo，基线版本 @deepseek-ai/dsh-root@0.1.0-rc.5）
git clone <deepseek-harness-官方仓库> && cd deepseek-harness-master

# 2. 应用本仓库的补丁（dsh-remote 默认启用、peer 范围放宽、ssh2 构建放行等）
git apply ../deepseek-harness-desktop/patches/desktop-runtime.patch

# 3. 构建官方仓库（产出 apps/cli/lib/bin.js 等）
pnpm install
pnpm run build

# 4. 回到本仓库，安装桌面壳依赖
cd ../deepseek-harness-desktop
npm install

# 5. 一键构建（Windows NSIS 安装包）
npm run build:win
# Linux rpm：npm run build:linux
```

产物位于 `dist/`：

- Windows：`dist/DeepSeek Harness-<version>-win-setup.exe`
- Linux：`dist/DeepSeek Harness-<version>-linux-x64.rpm`

### 网络镜像（可选）

构建机直连 nodejs.org / GitHub 不稳定时设置：

```bash
export NODE_MIRROR=https://npmmirror.com/mirrors/node
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
export ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
```

### 离线/复用构建机缓存

- `scripts/build.mjs` 会自动复用 `.tools/node-*`（已解压的免安装 Node）作为内置运行时，跳过下载。
- 已组装的 `runtime/` 与已构建的 `desktop/node_modules` 均幂等跳过（见 `prepare-runtime.mjs` 的 `isDshReady`）。

## 运行时装配说明

`prepare-runtime.mjs` 完成三件事：

1. **内置 Node**：下载/复用免安装 Node（v22.19.0，`DSH_DESKTOP_NODE_VERSION`/`NODE_MIRROR` 可覆盖）。
2. **dsh 安装根**：`pnpm --filter @deepseek-ai/dsh deploy --legacy --prod`，关键参数：
   - `--config.node-linker=hoisted`：扁平化顶层 node_modules。web profile 的模块回退目录（`healProfilesModuleFallback`）按字面路径解析闭包依赖，isolated 布局下嵌套传递依赖不可见。
   - `--config.auto-install-peers=false` / `--config.link-workspace-packages=true`。
   - 还原 `link:` override 的 vendored 包（`@deepseek-ai/cosmokit`、`schemastery`），legacy deploy 不会自动落盘。
3. **profile 模板**：写入 `runtime/templates/profiles/web`（web-app bundle 已默认启用 dsh-remote）。

## 对官方仓库的修改

完整差异见 [`patches/desktop-runtime.patch`](patches/desktop-runtime.patch)：4 个源文件改动（外加 `web-app/README.md` 与 `README.zh.md` 两处文档同步）：

| 文件 | 改动 |
| --- | --- |
| `apps/cli/package.json` | 补充 19 个 `peerDependencies`，使 profile 闭包（heal 回退）可解析到所有依赖 |
| `packages/bundle/web-app/cordis.patch.yml` | web profile 增加 `dsh-remote` 行（SSH 远程开发，默认启用） |
| `packages/bundle/web-app/package.json` | 增加 `dsh-remote: ^0.5.4` 依赖 |
| `pnpm-workspace.yaml` | `peerDependencyRules.allowedVersions` 放宽 dsh-remote 对 rc.6 的 peer 范围；`allowBuilds` 放行 `ssh2`/`cpu-features`（ssh2 的可选加速绑定，构建失败时自动降级） |

> 注：`dsh-remote` 为 npm 上的第三方插件（`dsh-remote@^0.5.4`），不属于官方仓库；启用其所需的最小 peer 范围放宽已写进 workspace 配置。若不想默认启用，删除补丁中 `cordis.patch.yml` 的 `dsh-remote` 行即可。

## 常见问题

- **SSH 连接失败？** 确认目标机器已开 SSH，且本机有可用密钥/口令。`ssh2` 的原生加速（cpu-features）在本机无 C 编译器时会自动跳过，不影响功能。
- **能否自己指定 Node 版本？** 构建时 `DSH_DESKTOP_NODE_VERSION` 可覆盖内置版本，但需满足 dsh 的 `engines`（`^22.19.0 || >=24.0.0`）。
- **rpm 需要什么发行版？** 红帽系（Fedora/RHEL/openEuler 等）。

## 许可证

MIT，见 [LICENSE](LICENSE)。上游 DeepSeek Harness 为 MIT，桌面壳与补丁由本仓库贡献者编写。
# dsh-desktop — DeepSeek Harness 桌面壳

基于官方 [`deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness) 仓库构建的桌面版：

- **Windows**：NSIS 安装包（`dist/*-win-setup.exe`）
- **Linux 红帽系**：rpm 安装包（`dist/*.rpm`，RHEL / Fedora / Rocky / AlmaLinux / openEuler 等）
- 不做 macOS。

## 特性

- **内置 Node.js 运行时与完整 dsh 安装**：安装后直接双击/菜单启动，**用户无需安装 Node.js**（Node 运行时随包附带，位于 `resources/runtime/node/`）。
- **默认启用 SSH 远程开发**：web profile 的 bundle 层已默认挂载 `dsh-remote` 插件（Settings → 远程工作区 添加机器；工作区选择器含 远程 tab；模型侧提供 `rw_*` 工具）。这是对官方仓库默认配置的修改（见 `repo/deepseek-harness-master` 中 `packages/bundle/web-app/cordis.patch.yml` 与 `package.json`、根 `pnpm-workspace.yaml` 的 peer 放行）。
- **默认启用 WSL 工作区**：`dsh-wsl-workspace` 插件（侧边栏底部 Settings 旁的 **W 按钮**）——从 Web GUI 添加 WSL 发行版工作区，bash 与文件工具直接在 WSL 内运行（VS Code Remote-WSL 风格），无需在 WSL 里安装 sshd/工具链。
- **完整 Web UI**：官方 dsh web 界面原样呈现，全部功能可用。
- **独立用户数据**：DSH_HOME 指向 `%APPDATA%/dsh-desktop/home`（Windows）或 `~/.config/dsh-desktop/home`（Linux），与命令行 `~/.dsh` 互不干扰。
- 系统托盘驻留、退出时有序停服（SIGTERM → 超时强杀，避免孤儿进程）。

## 目录结构

```
desktop/
  main.js                  Electron 主进程（拉起 dsh web、解析 URL、管理窗口/托盘）
  electron-builder.yml     打包配置（win nsis + linux rpm）
  installer.nsh            NSIS 自定义安装脚本（解压 dsh-runtime.7z 归档）
  assets/icon.png          应用图标
  tools/7za.exe            随包分发的 7-Zip 解压工具（安装器解压归档用，构建时自动复制）
  scripts/
    prepare-runtime.mjs    组装 runtime：内置 Node（就绪检测 + 交叉 pnpm shim）+ pnpm deploy dsh + profile 模板
    build.mjs              一键构建入口（prepare-runtime -> electron-builder -> 归档）
  runtime/                 构建产物（不入库）
    node/<platform>-<arch>/  内置免安装 Node.js
    dsh/                    dsh 安装根（node_modules 闭包，含 dsh-remote/ssh2）
    templates/profiles/web/  profile 骨架
  dist/                    发布产物输出
    DeepSeek Harness-<ver>-win-setup.exe   Windows 安装包（< 100MB，不含运行时）
    dsh-runtime.7z          node + dsh 运行时归档（安装时解压到 resources/runtime）
```

## 发布方式（Windows：安装包 + 运行时归档）

为把安装包控制在 100MB 以内，Windows 采用**拆分发布**：

- `DeepSeek Harness-<version>-win-setup.exe`：只含 Electron 壳 + 应用代码 + profile 模板 + 7za 工具（实际约 82MB）；
- `dsh-runtime.7z`：体积大头（内置 Node ~94MB + dsh 运行时 ~340MB，压缩后实际约 61MB）。

**安装时**：两个文件需放在同一目录；安装程序（`installer.nsh` 的 `customInstall`）用内置 7za 把归档解压到 `$INSTDIR\resources\runtime\`，与 main.js 的路径约定一致。归档缺失时安装会中止并提示。

**升级/换机器**：只需重新下载并安装 exe（运行时归档通用，`dsh-runtime.7z` 无需随版本变化除非升级了 Node/dsh）。

## 构建（从零到 exe，需要联网）

构建机要求：Windows 或 Linux x64；Node.js 22+（或任意能跑 pnpm 的 Node）、pnpm ≥ 10、git。**Linux 构建机可直接交叉构建 Windows 安装包**（脚本已适配：pnpm 预置、归档 7za 均按宿主平台处理），**无需 wine**。

**前置：`../repo/deepseek-harness-master/` 必须先构建**（`pnpm install && pnpm run build`，产出 `apps/cli/lib/bin.js` 与 web dist）。`prepare-runtime` 的 `pnpm deploy` 依赖它，未构建会直接报「仓库尚未构建」。最省事的方式是先在仓库根目录跑 `node scripts/setup.mjs` 完成全部准备（repo 构建 + desktop 依赖 + runtime 组装），再执行本节命令。

```sh
# 0) 构建官方仓库源码树。本仓库已预置 repo/deepseek-harness-master/（含补丁与
#    dsh-memory-evolve 离线快照，无需再从 GitHub 克隆/apply）：
cd repo/deepseek-harness-master
pnpm install          # 首次或依赖变更后；GitHub 不可达时先跑 scripts/setup.mjs 建本地镜像
pnpm run build        # 必须：产出 apps/cli/lib/bin.js 与 web dist（deploy 的前置）
cd ../..

# 1) 安装桌面壳依赖
cd desktop
npm install

# 2) Windows 安装包（Linux 构建机交叉构建同样支持）
npm run build:win
# 或 Linux rpm（在 Linux 构建机上执行）
npm run build:linux
```

产物在 `desktop/dist/`。构建脚本会自动：

1. 组装内置 Node 运行时（`DSH_DESKTOP_NODE_VERSION` 指定版本，默认 `v22.19.0`；`NODE_MIRROR` 换镜像）。**已就绪自动跳过下载**（检测 `runtime/node/<platform>-<arch>/node.exe` 或 `bin/node`，离线可复用）。
2. （Windows 交叉构建时）用宿主 npm 把 pnpm 包装进内置 Node 目录，生成 `pnpm.cmd` / `pnpm.ps1` shim（插件市场 dshmarket 依赖 PATH 中的 pnpm）。
3. 在官方仓库内执行 `pnpm --filter @deepseek-ai/dsh deploy`，把 dsh 及其生产依赖（含默认启用的 `dsh-remote`）组装为独立安装根（`runtime/dsh` 已就绪时跳过）。**前置：仓库已构建（步骤 0 的 `pnpm run build`）。**
4. 生成 web profile 模板。
5. （Windows）复制 7zip-bin 的 win 版 7za.exe 到 `tools/7za.exe`，随包分发供安装器解压归档。
6. 调用 electron-builder 打包（Windows NSIS / Linux rpm）。**nsis / nsis-resources / winCodeSign 工具链从 GitHub 下载**，被墙时构建在 NSIS 阶段失败，处理见下「网络与缓存」。
7. （Windows）把 `runtime/node` + `runtime/dsh` 压缩为 `dist/dsh-runtime.7z` 归档——**归档 7za 按宿主平台自动选择**（Linux 构建机用 linux 版，无需 wine）。

## 网络与缓存（离线 / 受限网络）

- **Node 运行时**：已就绪自动跳过下载；也可手动解压免安装包后 `node scripts/prepare-runtime.mjs --node <dir>` 跳过下载。
- **electron 本体二进制**：`ELECTRON_MIRROR` 指向镜像（如 `https://npmmirror.com/mirrors/electron/`），或预置 `~/.cache/electron/electron-v<ver>-<platform>-<arch>.zip`。
- **electron-builder 工具链（nsis / nsis-resources / winCodeSign）**：从 GitHub 下载，被墙时构建报 `Get "https://github.com/electron-userland/electron-builder-binaries/..." EOF`。解决：
  - 设 `ELECTRON_BUILDER_BINARIES_MIRROR=https://registry.npmmirror.com/-/binary/electron-builder-binaries/`（注意：`https://npmmirror.com/mirrors/electron-builder-binaries/` 已失效 404）；或
  - 预置缓存 `~/.cache/electron-builder/`：`nsis/nsis-3.0.4.1/`（含 `linux/makensis`）、`nsis-resources/nsis-resources-3.4.1/`、`winCodeSign/winCodeSign-2.6.0/`。
- **npm registry 慢/不稳**：pnpm deploy 阶段可能遇 `ECONNRESET`/慢速重试，pnpm 会自动重试；持续失败可 `npm config set registry https://registry.npmmirror.com`。
- **dsh-memory-evolve（git 依赖）**：GitHub 封锁时 `scripts/setup.mjs` 会用 `repo/vendor/dsh-memory-evolve/` 快照建本地镜像并配 `insteadOf` 重定向（详见根 README「网络受限 / 离线构建」）。

## 已知问题与踩坑

- **`repo/vendor/dsh-memory-evolve` 是纯 client 插件**（bundle 由包内 `scripts/build.mjs` 产出），没有 `lib/types/*` host 构建目标；仓库根 `tsdown.config.ts` 的 workspace glob `vendor/*` 会把它纳入构建导致 `Cannot find entry`。包内 `tsdown.config.ts`（`entry: ''`）负责跳过 workspace 构建，**不要删除**。
- 若 `prepare-runtime` 每次都重新下载 Node（日志反复出现「下载 https://nodejs.org/dist/...」），说明 `runtime/node/<platform>-<arch>/node.exe` 缺失；正常已就绪时日志应为「Node 运行时已存在」。
- WSL 环境偶发 DNS 解析失败（`getent hosts` 对任意域名均失败），会影响 `git push` / npm / 下载，一般等待网络恢复即可。

## 开发调试

```sh
cd desktop
npm install
node scripts/prepare-runtime.mjs          # 组装本地 runtime（dev 模式复用）
DESKTOP_DEV=1 npx electron .              # 直接跑 Electron 壳
```

`DESKTOP_DEV=1` 时 main.js 从 `./runtime` 解析内置运行时。

## 注意

- Linux rpm 打包需在 Linux 上执行；electron-builder 自带 rpm 生成能力，个别发行版需预装 `rpmbuild`（`dnf install rpm-build`）或 `fpm`。
- 鸿蒙客户端壳见 `../harmony/`（鸿蒙 NEXT 无法运行 Node.js，壳以 ArkWeb 加载远程 dsh 服务地址）。

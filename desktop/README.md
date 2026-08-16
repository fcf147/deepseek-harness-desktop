# dsh-desktop — DeepSeek Harness 桌面壳

基于官方 [`deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness) 仓库构建的桌面版：

- **Windows**：NSIS 安装包（`dist/*-win-setup.exe`）
- **Linux 红帽系**：rpm 安装包（`dist/*.rpm`，RHEL / Fedora / Rocky / AlmaLinux / openEuler 等）
- 不做 macOS。

## 特性

- **内置 Node.js 运行时与完整 dsh 安装**：安装后直接双击/菜单启动，**用户无需安装 Node.js**（Node 运行时随包附带，位于 `resources/runtime/node/`）。
- **默认启用 SSH 远程开发**：web profile 的 bundle 层已默认挂载 `dsh-remote` 插件（Settings → 远程工作区 添加机器；工作区选择器含 远程 tab；模型侧提供 `rw_*` 工具）。这是对官方仓库默认配置的修改（见 `repo/deepseek-harness-master` 中 `packages/bundle/web-app/cordis.patch.yml` 与 `package.json`、根 `pnpm-workspace.yaml` 的 peer 放行）。
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
    prepare-runtime.mjs    组装 runtime：下载内置 Node + pnpm deploy dsh 安装根 + profile 模板
    build.mjs              一键构建入口
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

- `DeepSeek Harness-<version>-win-setup.exe`：只含 Electron 壳 + 应用代码 + profile 模板 + 7za 工具（约 90MB）；
- `dsh-runtime.7z`：体积大头（内置 Node ~94MB + dsh 运行时 ~266MB，压缩后约 57MB）。

**安装时**：两个文件需放在同一目录；安装程序（`installer.nsh` 的 `customInstall`）用内置 7za 把归档解压到 `$INSTDIR\resources\runtime\`，与 main.js 的路径约定一致。归档缺失时安装会中止并提示。

**升级/换机器**：只需重新下载并安装 exe（运行时归档通用，`dsh-runtime.7z` 无需随版本变化除非升级了 Node/dsh）。

## 构建（从零到 exe，需要联网）

构建机要求：Windows 或 Linux x64；Node.js 22+（或任意能跑 pnpm 的 Node）、pnpm ≥ 10、git。

```sh
# 0) 克隆官方仓库并锁定基线 0.1.0-rc.5，应用补丁（5 个默认插件等）
#    补丁在本仓库的发布版 deepseek-harness-desktop（Gitee: summerwindow741/deepseek-harness-desktop）中：
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
git checkout 0.1.0-rc.5
git apply ../deepseek-harness-desktop/patches/desktop-runtime.patch
pnpm install
pnpm run build

# 1) 回到桌面工程，安装 Electron 打包依赖
cd ../deepseek-harness-desktop
npm install

# 2) Windows 安装包
npm run build:win
# 或 Linux rpm（在 Linux 构建机上执行）
npm run build:linux
```

产物在 `desktop/dist/`。构建脚本会自动：

1. 下载免安装 Node.js 运行时（`DSH_DESKTOP_NODE_VERSION` 可指定版本，默认 `v22.19.0`；`NODE_MIRROR` 可换镜像）。
2. 在官方仓库内执行 `pnpm --filter @deepseek-ai/dsh deploy`，把 dsh 及其生产依赖（含默认启用的 `dsh-remote`）组装为独立安装根。
3. 生成 web profile 模板。
4. （Windows）复制 `tools/7za.exe` 供安装器解压归档使用。
5. 调用 electron-builder 打包（Windows NSIS / Linux rpm）。
6. （Windows）把 `runtime/node` + `runtime/dsh` 压缩为 `dist/dsh-runtime.7z` 归档。

离线/受限网络时：手动解压 Node 到目录后用 `node scripts/prepare-runtime.mjs --node <dir>` 跳过下载；Electron 二进制可用 `ELECTRON_MIRROR` 指向镜像。

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

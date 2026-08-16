# DeepSeek Harness — 桌面化定制工程（单仓库）

基于官方 [`deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness)（基线 `0.1.0-rc.5`）的定制仓库，包含两项核心工作：

1. **开箱即用 SSH 远程开发**：web profile 默认启用 5 个第三方插件（`dsh-remote`、`dshmarket`、`dsh-message-edit`、`dsh-vision-toolkit`、`dsh-memory-evolve`）。
2. **桌面化**：`desktop/`（Electron 壳，用户免装 Node.js）+ `harmony/`（鸿蒙 ArkWeb 客户端）。

## 仓库结构

```
.
├── repo/deepseek-harness-master/   # 官方仓库（已应用补丁，含 lib 编译产物）
│   └── patches/desktop-runtime.patch # 补丁集（也可在 release/ 独立查看）
├── desktop/                        # 桌面壳工程（Electron + 内置 Node/dsh 运行时）
│   ├── main.js                     # Electron 主进程
│   ├── scripts/
│   │   ├── prepare-runtime.mjs     # 组装 runtime：内置 Node + pnpm deploy dsh + profile 模板
│   │   └── build.mjs               # 一键构建：prepare-runtime -> electron-builder -> 归档
│   ├── electron-builder.yml        # 打包配置（win nsis 拆分 / linux rpm 全量）
│   └── installer.nsh               # NSIS 安装时解压 dsh-runtime.7z 归档
├── harmony/                        # HarmonyOS ArkWeb 客户端（连接 dsh web 服务）
├── release/deepseek-harness-desktop/  # 发布版（源码副本 + 补丁 + 说明，供 Gitee Release 引用）
└── scripts/setup.mjs               # ★ 一键开发准备（见下）
```

## 快速开始（一键开发准备）

克隆后**一条命令**完成全部准备（官方仓库依赖+构建、桌面壳依赖、runtime 组装）：

```bash
git clone https://gitee.com/summerwindow741/deepseek-harness-desktop.git
cd deepseek-harness-desktop
node scripts/setup.mjs        # 需要 node ≥ 22 与 pnpm ≥ 10（npm i -g pnpm）
```

脚本自动完成：
1. 环境检查（node / pnpm）
2. `repo/`：`pnpm install` + `pnpm run build`（仓库已含补丁与 lib 产物，幂等）
3. `desktop/`：`npm install` + `prepare-runtime.mjs`（组装内置 Node v22.19.0 + dsh 安装根 + profile 模板）

国内网络可先设置镜像环境变量（setup 脚本透传）：

```bash
export NODE_MIRROR=https://npmmirror.com/mirrors/node
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
export ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
```

## 构建发布产物

```bash
cd desktop
npm run build:win      # Windows：dist/*-win-setup.exe（<100MB）+ dist/dsh-runtime.7z（57MB，两者同目录发布）
npm run build:linux    # Linux rpm（在 Linux 构建机上，全量打包无拆分）
```

Windows 为**拆分发布**：安装包只含 Electron 壳 + 模板 + 7za 工具；`dsh-runtime.7z`（内置 Node + dsh 运行时）由安装器解压到 `resources\runtime\`。**发布时两个文件放同一目录**。

## 对官方仓库的修改

见 [`release/deepseek-harness-desktop/patches/README.md`](release/deepseek-harness-desktop/patches/README.md) 与 `desktop/README.md` 的说明。核心：5 个插件默认启用、19 个 peer 依赖补充、ssh2 构建放行、`minimumReleaseAgeExclude`。

## 说明

- `repo/` 的 `node_modules`、`apps/web/dist` 等构建产物不入库（.gitignore 排除）；`lib/` 编译产物入库以支持免构建直接 assemble runtime。
- `release/publish-*/` 发布包二进制（exe/7z）不入库，已上传 Gitee Release。
- 鸿蒙客户端开发：用 DevEco Studio 5.0+ 打开 `harmony/`。
- 不做 macOS。

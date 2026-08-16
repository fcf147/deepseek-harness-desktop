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
2. GitHub 可达性检测（不可达时自动启用本地 git 镜像离线方案，见下）
3. `repo/`：`pnpm install` + `pnpm run build`（仓库已含补丁；构建生成 lib 产物）
4. `desktop/`：`npm install` + `prepare-runtime.mjs`（组装内置 Node v22.19.0 + dsh 安装根 + profile 模板）

国内网络可先设置镜像环境变量（setup 脚本透传，registry 默认已走 npmmirror）：

```bash
export NODE_MIRROR=https://npmmirror.com/mirrors/node
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
export ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
```

## 网络受限 / 离线构建（GitHub 封锁时）

`dsh-memory-evolve`（web profile 默认启用的跨会话记忆插件）**仅发布在 GitHub**，以 git 依赖声明（`github:dsh-external/dsh-memory-evolve#main`）。若构建机无法访问 github.com（常见于部分网络环境），`pnpm install`/`pnpm deploy` 会失败。

`scripts/setup.mjs` 内置**离线方案**，自动处理：

1. 启动时用 node `fetch` 探测 `api.github.com` 连通性（curl/PowerShell 可能被网络策略限制，但 node 通常可用）。
2. 不可达时，检查仓库预置源码快照 `repo/vendor/dsh-memory-evolve/`（本仓库已随包提供），用其创建**本地 git 裸仓库**（`.tools/git-mirror/dsh-memory-evolve.git`，含 `main` 分支）。
3. 配置 git `url.<local>.insteadOf`，把 `https://github.com/dsh-external/dsh-memory-evolve.git`（含 `git+https` 变体）重定向到本地镜像——pnpm 的 git 依赖解析完全离线。
4. 幂等：镜像已存在则复用；已配置过重定向则不重复设置。

手动执行等价操作：

```bash
# 探测连通性
node -e "fetch('https://api.github.com').then(r=>console.log(r.status)).catch(e=>console.log('OFFLINE',e.message))"

# GitHub 不通时手动创建镜像（快照已随仓库提供）
git init -b main repo/vendor/dsh-memory-evolve   # 若快照尚未 init
git -C repo/vendor/dsh-memory-evolve add -A
git -C repo/vendor/dsh-memory-evolve -c user.name=dsh -c user.email=dsh@local commit -m snapshot
git clone --bare repo/vendor/dsh-memory-evolve .tools/git-mirror/dsh-memory-evolve.git
git config --global url.file://$PWD/.tools/git-mirror/dsh-memory-evolve.git.insteadOf https://github.com/dsh-external/dsh-memory-evolve.git
```

> 说明：依赖指向 `#main` 而非钉提交，是为了让离线镜像可解析（本地镜像无法伪造上游的 40 位 SHA 对象）；若你的环境可访问 GitHub 且追求可复现，可把 `packages/bundle/web-app/package.json` 中该依赖改回固定提交 `ce7f0faa0e0240f117c29795e9224c0d9ed18183`，并同步更新 `pnpm-lock.yaml`。

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

- `repo/` 的 `node_modules`、`lib/`（官方 .gitignore 排除）、`apps/web/dist` 等构建产物不入库，由 `pnpm install && pnpm run build` 生成。
- `release/publish-*/` 发布包二进制（exe/7z）不入库，已上传 Gitee Release。
- `repo/vendor/dsh-memory-evolve/` 为离线构建预置的源码快照（见「网络受限/离线构建」）。
- 鸿蒙客户端开发：用 DevEco Studio 5.0+ 打开 `harmony/`。
- 不做 macOS。

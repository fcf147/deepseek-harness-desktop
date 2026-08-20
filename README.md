# DeepSeek Harness — 桌面化定制工程（单仓库）

> **仅官方 harness + 桌面壳**：本仓库在 `yuanbanjiake` 分支移除全部非官方定制——6 个第三方插件（`dsh-remote`、`dshmarket`、`dsh-message-edit`、`@dsh-external/dsh-vision-toolkit`、`dsh-memory-evolve`、`dsh-wsl-workspace`）、自定义 `summer-craft` 预设及其 `dsh-code-review`/`dsh-doc-standards` 两个 skill、以及 `repo/vendor/dsh-memory-evolve` 离线快照均已删除。当前仓库仅保留 **官方 [`deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness) 基线（含官方 `@deepseek-ai/dsh-mcp-client`）+ 桌面壳（`desktop/` Electron + `harmony/` 鸿蒙）+ 官方默认会话基础设施**。

> **版本基线说明**：本仓库基于官方 [`deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness) 的 **`0.1.0-rc.8` 完整源码快照**（`repo/deepseek-harness-master/`）定制。rc.8 为官方发布的最新 tag，含完整 monorepo 源码树；官方依赖闭包与 peer 范围均已自洽，无需对 `repo/deepseek-harness-master/` 打任何补丁。升级路径见「升级官方基线」章节。

基于官方 [`deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness)（基线 `0.1.0-rc.8`）的定制仓库，核心工作只有一项：

1. **桌面化**：`desktop/`（Electron 壳，用户免装 Node.js）+ `harmony/`（鸿蒙 ArkWeb 客户端），把官方 harness 打包成开箱即用的桌面应用。

> 官方已默认启用的会话基础设施（无需额外配置）：`session-persistence-jsonl`（zstd 持久化）、`session-log-export`（会话导出）、`session-query-sqlite`（会话查询）、`plan-mode`（plan 模式）、skill 全家（registry / filesystem / tool），以及官方预置的 `standard` / `minimal` 会话档位。

桌面版首次启动弹窗选择档位（默认 Standard），选择写入 `$DSH_HOME/settings.yaml` 的 `agent-presets.default`；CLI 用户可在设置中切换。详见 `desktop/main.js` 的 `ensurePresetChoice()`。


## 仓库结构

```
.
├── repo/deepseek-harness-master/   # 官方仓库（已应用补丁，含 lib 编译产物）
│   └── patches/desktop-runtime.patch # 历史补丁空壳（rc.8 基线无需对官方源码打补丁）
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
# 注意：electron-builder-binaries 的 npmmirror 前缀必须是 registry.npmmirror.com/-/binary/
# （https://npmmirror.com/mirrors/electron-builder-binaries/ 已失效，返回 404）
export ELECTRON_BUILDER_BINARIES_MIRROR=https://registry.npmmirror.com/-/binary/electron-builder-binaries/
```

## 网络受限 / 离线构建（GitHub 封锁时）

本仓库已移除全部第三方 / 自定义插件（含原本仅发布在 GitHub 的 `dsh-memory-evolve` git 依赖及其 `repo/vendor/dsh-memory-evolve` 离线快照、`scripts/setup.mjs` 内的本地 git 镜像方案），因此 `pnpm install` / `pnpm deploy` 不再依赖任何 GitHub 私有仓库，普通网络环境下可直接安装官方依赖。

唯一仍依赖 GitHub 的是 **electron-builder 的二进制下载**（见下），与插件无关。

**electron-builder 的二进制下载同样依赖 GitHub**：打包 Windows 安装包时，electron-builder 会从 `github.com/electron-userland/electron-builder-binaries` 拉取 `nsis`、`nsis-resources`、`winCodeSign` 等工具链。GitHub 不可达时构建会在 NSIS 阶段失败（报 `Get "https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-..." EOF`），两种解决方式（推荐前者）：

```bash
# 方式一：镜像环境变量（与上面 setup 章节的变量一起导出）
export ELECTRON_BUILDER_BINARIES_MIRROR=https://registry.npmmirror.com/-/binary/electron-builder-binaries/

# 方式二：预置缓存（构建机一次性；Linux/macOS 缓存目录 ~/.cache/electron-builder/，
#         Windows 为 %LOCALAPPDATA%/electron-builder/Cache）：
#   nsis/nsis-3.0.4.1/            （含 linux/makensis，Linux 构建机用）
#   nsis-resources/nsis-resources-3.4.1/
#   winCodeSign/winCodeSign-2.6.0/
#   electron 本体同理可预置 ~/.cache/electron/electron-v<ver>-<platform>-<arch>.zip
```

## 构建发布产物

```bash
cd desktop
npm run build:win      # Windows：dist/*-win-setup.exe（约 82MB）+ dist/dsh-runtime.7z（约 61MB，两者同目录发布）
npm run build:linux    # Linux rpm（在 Linux 构建机上，全量打包无拆分）
```

**前置条件**：`repo/deepseek-harness-master/` 必须先构建（`pnpm install && pnpm run build`，产出 `apps/cli/lib/bin.js` 与 web dist）——`prepare-runtime` 的 `pnpm deploy` 依赖它，未构建会直接报「仓库尚未构建」。用 `node scripts/setup.mjs` 一条命令可完成 repo 构建 + desktop 依赖 + runtime 组装，再执行上面的构建命令即可。

**交叉构建**：Linux 构建机上直接跑 `npm run build:win` 即可产出 Windows 安装包（脚本已适配：pnpm 以宿主 npm 包装成 win shim、归档自动选用 Linux 版 7za），**无需 wine**。构建期的详细说明与踩坑见 [`desktop/README.md`](desktop/README.md)。

Windows 为**拆分发布**：安装包只含 Electron 壳 + 模板 + 7za 工具；`dsh-runtime.7z`（内置 Node + dsh 运行时，实际约 61MB）由安装器解压到 `resources\runtime\`。**发布时两个文件放同一目录**。

### 校验下载完整性（sha256）

发布时随 Release 附带校验文件 `sha256sums.txt`（每个发布文件一行：`<64位哈希>  <文件名>`）。**安装前请先校验，且 exe 与 7z 必须来自同一 Release、哈希一致**——安装器本身不校验归档，损坏或串包的 `dsh-runtime.7z` 会导致安装失败或运行时异常：

```bash
# Linux / macOS
sha256sum -c sha256sums.txt

# Windows PowerShell（将输出与 sha256sums.txt 中对应行比对）
Get-FileHash '.\DeepSeek Harness-<版本>-win-setup.exe' -Algorithm SHA256
Get-FileHash '.\dsh-runtime.7z' -Algorithm SHA256
```

哈希不一致请勿安装，并在 Gitee Issues 反馈。

## 对官方仓库的修改

本仓库**不修改官方 harness 源码**。`repo/deepseek-harness-master/` 即官方 `deepseek-harness` `0.1.0-rc.8` 的完整源码快照——官方依赖闭包与 peer 范围均已自洽，桌面版 `pnpm deploy` 可直接解析，无需任何补丁。所有桌面化工作都发生在 `repo/` 之外的 `desktop/`（Electron 壳）、`harmony/`（鸿蒙客户端）与本仓库根脚本（`scripts/setup.mjs`）中。

> 早期版本曾对官方源码打补丁（19 个 `@deepseek-ai/*` 依赖闭包 + peer 范围放宽）以适配 rc.5；升级到 rc.8 后这些补丁已不再需要，`release/deepseek-harness-desktop/patches/` 仅保留空壳以备追溯。

## 说明

- `repo/` 的 `node_modules`、`lib/`（官方 .gitignore 排除）、`apps/web/dist` 等构建产物不入库，由 `pnpm install && pnpm run build` 生成。
- `release/publish-*/` 发布包二进制（exe/7z）不入库，已上传 Gitee Release（附 `sha256sums.txt`，见上文校验说明）。
- 鸿蒙客户端开发：用 DevEco Studio 5.0+ 打开 `harmony/`。
- 不做 macOS（开发者的产品决策，暂不打算支持；与是否拥有 Mac 无关）。

## 升级官方基线

本仓库直接跟踪官方 `deepseek-harness` 的发布 tag；`repo/deepseek-harness-master/` 就是官方源码快照。升级到更新的官方版本（如后续发布的 `dsh-v0.1.0-rc.9`）按以下步骤：

1. **获取官方源码树**：`git clone https://github.com/deepseek-ai/deepseek-harness.git`，checkout 目标 tag（需**完整源码树**，不是 npm CLI 聚合 tarball）。
2. **替换基线快照**：将 `repo/deepseek-harness-master/` 整个目录替换为官方源码树（我们自己的非 harness 文件不在此目录内，不受影响）。官方源码自洽，无需迁移补丁。
3. **重新构建桌面版**：`node scripts/setup.mjs && cd desktop && npm run build:win`（或对应平台）。

> 升级基线是独立工程，建议在可访问 GitHub 的环境进行。

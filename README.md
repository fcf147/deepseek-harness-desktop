# DeepSeek Harness — 桌面化定制工程（单仓库）

> **第三方插件声明**：本仓库默认启用的 5 个插件（`dsh-remote`、`dshmarket`、`dsh-message-edit`、`@dsh-external/dsh-vision-toolkit`、`dsh-memory-evolve`）**均为第三方开源插件，非 DeepSeek 官方出品，亦非 DeepSeek 背书**；它们由本仓库维护者自选启用（默认挂载是**本仓库的定制行为**，通过补丁落地，见「对官方仓库的修改」），官方 [`deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness) 默认并不启用它们。不需要的插件可删除 `packages/bundle/web-app/cordis.patch.yml` 中对应行后重新构建关闭。

> **版本基线说明**：本仓库基于官方 [`deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness) 的 **`0.1.0-rc.5` 完整源码快照**（`repo/deepseek-harness-master/`）定制。npm 上最新已发布 `0.1.0-rc.6`，但 **rc.6 为 CLI 聚合包（编译产物），不是完整 monorepo 源码树**，且其与 rc.5 源码树存在差异（provider 适配、cordis patch 兼容层有改动），补丁无法直接迁移。因此本仓库**有意锁定 rc.5 基线**以保证构建可复现；升级路径见「升级官方基线」章节。

基于官方 [`deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness)（基线 `0.1.0-rc.5`）的定制仓库，包含两项核心工作：

1. **开箱即用 SSH 远程开发**：web profile 默认启用 5 个第三方插件（`dsh-remote`、`dshmarket`、`dsh-message-edit`、`@dsh-external/dsh-vision-toolkit`、`dsh-memory-evolve`）。
2. **桌面化**：`desktop/`（Electron 壳，用户免装 Node.js）+ `harmony/`（鸿蒙 ArkWeb 客户端）。

### 默认插件的来源与为什么默认启用

| 插件 | 来源 | 默认启用的原因 |
|---|---|---|
| `dsh-remote` | npm registry | SSH 远程开发（多机注册表、远程工作区、面向模型的 `rw_*` 工具），本仓库「开箱即用远程开发」的核心能力 |
| `dshmarket` | npm registry | 可视化插件市场（浏览 / 搜索 / 一键安装） |
| `dsh-message-edit` | npm registry | 分支式消息编辑、reroll、重试与版本时间线 |
| `@dsh-external/dsh-vision-toolkit` | npm registry（`@dsh-external` scope） | 图像问答、OCR、定位、界面还原、像素级对比 |
| `dsh-memory-evolve` | **GitHub 外部组织 [`dsh-external`](https://github.com/dsh-external)**（git 依赖 `github:dsh-external/dsh-memory-evolve#1aca4c4`，**非 DeepSeek 官方**） | 跨会话长期记忆 + 后台自我进化，与 dsh 的上下文机制互补，日常使用价值高 |

> 其中 `dsh-memory-evolve` 仅发布在 GitHub（npm 上为私有包），未走 npm registry，故以 git 依赖声明；其源码快照随本仓库预置在 `repo/vendor/dsh-memory-evolve/` 供离线构建使用，可自行审计。

### 插件分层架构

插件按职责分两层挂载，避免"多会话串台"与重复注册：

**1. Host plane（进程级，`packages/bundle/web-app/cordis.patch.yml`）** —— 多会话共享的基础设施：

- `dsh-remote`、`dshmarket`、`dsh-message-edit`、`@dsh-external/dsh-vision-toolkit`（第三方，npm）
- `dsh-memory-evolve`（第三方，GitHub git 依赖，自带 bundle patch 自动注册）
- `@deepseek-ai/dsh-mcp-client` × 2（**新增**：官方 MCP client 桥接，预置 filesystem + sqlite 两个安全演示 MCP，工具名 `mcp__filesystem__*` / `mcp__sqlite__*`）

> 官方已默认启用的会话基础设施（无需配置）：`session-persistence-jsonl`（zstd 持久化）、`session-log-export`（会话导出）、`session-query-sqlite`（会话查询）、`plan-mode`（plan 模式）、skill 全家（registry / filesystem / tool）。

**2. Preset 会话层（`apps/cli/config/agent-presets/<id>/agent.cordis.yml`）** —— 每会话私有，按档位组合：

- **summer-craft**（新增，桌面版默认档）：完整编码 agent + 通用代码评审 skill（`dsh-code-review`）+ 文档标准 skill（`dsh-doc-standards`）+ 增强 plan-mode 指导 + memory-evolve/message-edit 会话级配置覆盖
- **standard**（官方默认档）：官方标准编码 agent
- **minimal**（官方极简档）：固定提示词 + bash + 文件编辑

桌面版首次启动弹窗选择档位（默认 Summer-Craft），选择写入 `$DSH_HOME/settings.yaml` 的 `agent-presets.default`；CLI 用户可在设置中切换。详见 `desktop/main.js` 的 `ensurePresetChoice()`。


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
# 注意：electron-builder-binaries 的 npmmirror 前缀必须是 registry.npmmirror.com/-/binary/
# （https://npmmirror.com/mirrors/electron-builder-binaries/ 已失效，返回 404）
export ELECTRON_BUILDER_BINARIES_MIRROR=https://registry.npmmirror.com/-/binary/electron-builder-binaries/
```

## 网络受限 / 离线构建（GitHub 封锁时）

`dsh-memory-evolve`（web profile 默认启用的跨会话记忆插件，**来自 GitHub 外部组织 `dsh-external`，非 DeepSeek 官方**）**仅发布在 GitHub**，以 git 依赖声明并钉在固定提交（`github:dsh-external/dsh-memory-evolve#1aca4c4`）。若构建机无法访问 github.com（常见于部分网络环境），`pnpm install`/`pnpm deploy` 会失败。

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

> 说明：`dsh-memory-evolve` 以 git 依赖**钉在固定提交** `1aca4c49f23116e05f9ee645265bcdcf7e50d9a0`（而非 `#main`），保证每次安装/构建拉取完全相同的代码，构建可复现；离线镜像（`.tools/git-mirror/dsh-memory-evolve.git`）预置了该提交及其完整历史，GitHub 不可达时同样可解析。如需升级该插件，更新依赖声明与 `pnpm-lock.yaml` 后同步刷新离线镜像即可。

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

全部修改集中在补丁集 [`desktop-runtime.patch`](release/deepseek-harness-desktop/patches/desktop-runtime.patch)（4 个文件），摘要如下：

| 文件 | 改动 | 目的 |
|---|---|---|
| `apps/cli/package.json` | 补充 19 个 `@deepseek-ai/*` workspace 依赖 | 桌面版 `pnpm deploy` 只装生产依赖，插件「模块回退目录」需要完整依赖闭包，否则 hoisted 布局下运行时 `Cannot find package` |
| `packages/bundle/web-app/cordis.patch.yml` | 宿主行新增 5 个第三方插件行 | 「默认启用 5 个插件」的落地位置 |
| `packages/bundle/web-app/package.json` | 补充 5 个插件依赖（其中 `dsh-memory-evolve` 为 git 依赖，钉在提交 `1aca4c4`） | 声明插件依赖 |
| `pnpm-workspace.yaml` | ① 放宽 dsh-remote 的 6 个 `@deepseek-ai/*` peer 范围（rc.6 → rc.5）；② 放行 `ssh2`/`cpu-features` 构建脚本；③ `minimumReleaseAgeExclude` 放行 `dshmarket@1.9.0` | 让插件在 rc.5 基线下可安装、可构建 |

> **关于 `minimumReleaseAgeExclude`（已知的 pnpm 门禁放宽）**：pnpm 10 默认拒绝安装**发布不足 72 小时**的新包（`minimumReleaseAge`，防供应链投毒的时间窗口）。`dshmarket@1.9.0` 发布尚不足该期限，故在此显式放行；**仅针对这一个包**，其余包仍受门禁保护。该条目随包龄增长自动失效，届时可从配置移除。

逐条「为什么」与可审计细节见 [`release/deepseek-harness-desktop/patches/README.md`](release/deepseek-harness-desktop/patches/README.md) 与 `desktop/README.md`。

## 说明

- `repo/` 的 `node_modules`、`lib/`（官方 .gitignore 排除）、`apps/web/dist` 等构建产物不入库，由 `pnpm install && pnpm run build` 生成。
- `release/publish-*/` 发布包二进制（exe/7z）不入库，已上传 Gitee Release（附 `sha256sums.txt`，见上文校验说明）。
- `repo/vendor/dsh-memory-evolve/` 为离线构建预置的源码快照（见「网络受限/离线构建」）。
- 鸿蒙客户端开发：用 DevEco Studio 5.0+ 打开 `harmony/`。
- 不做 macOS（开发者的产品决策，暂不打算支持；与是否拥有 Mac 无关）。

## 升级官方基线

本仓库锁定官方 `0.1.0-rc.5` 源码快照（理由见开头「版本基线说明」）。升级到更新的官方版本（如 npm 已发布的 `0.1.0-rc.6` 对应的源码树）按以下步骤：

1. **获取官方源码树**：`git clone https://github.com/deepseek-ai/deepseek-harness.git`（或从能访问 GitHub 的机器拉取），checkout 目标版本（rc.6 需官方 master/对应 tag 的**完整源码**，npm tarball 只是 CLI 聚合包，不能作为基线）。
2. **重建基线快照**：替换 `repo/deepseek-harness-master/` 为新的官方源码树，重新 `pnpm install && pnpm run build`。
3. **迁移补丁**：`desktop-runtime.patch` 基于 rc.5 上下文，rc.6 改动过 provider 适配与 cordis patch 兼容层，直接 `git apply` 大概率冲突。用 `git apply --reject` 逐块合并（`release/deepseek-harness-desktop/patches/README.md` 有说明），重点核对：
   - `apps/cli/package.json` 的 19 个 workspace 依赖补充（rc.6 若已补齐可移除）
   - `pnpm-workspace.yaml` 的 peer 范围放宽（rc.6 原生支持时删除）
   - `dsh-remote` 等第三方插件的 peer 兼容
4. **刷新离线镜像**：`dsh-memory-evolve` 若更新版本，同步更新钉住的提交与 `.tools/git-mirror/`。
5. **重新构建桌面版**：`node scripts/setup.mjs && cd desktop && npm run build:win`。

> 升级基线是独立工程，建议在可访问 GitHub 的环境进行；本仓库保持 rc.5 是为了当前离线环境下的可复现构建。

# Release 说明 — DeepSeek Harness 桌面版 0.1.2

> 面向 Gitee Release 页的发布说明。发布时需同时上传 **两个文件**（Windows）：

| 文件 | 大小 | 说明 |
| --- | --- | --- |
| `DeepSeek Harness-0.1.2-win-setup.exe` | ~78 MB | 安装包（< 100MB）：Electron 壳 + 应用代码 + profile 模板 + 7za 解压工具 |
| `dsh-runtime.7z` | ~75 MB | 运行时归档：内置 Node.js v22.19.0 + dsh 生产依赖闭包（含 5 个默认插件 + Windows 平台原生模块） |

**两个文件必须放在同一目录**，安装程序会在安装时自动用内置 7za 把归档解压到 `resources\runtime\`。安装前请先校验 sha256（见文末），exe 与 7z 必须来自同一 Release。

---

## v0.1.2 更新内容（自 v0.1.1）

### 🚀 新增

- **一键发布构建脚本 `scripts/build-release.mjs`**：`--version` 控制版本号（自动同步 `desktop/package.json`、`desktop/package-lock.json` 与 `release` 副本的 version 字段，再重建产物——版本号不能只重命名 exe，electron-builder 用 package.json 生成文件名与内嵌版本）；支持 `--platform win|linux`、`--arch`、`--node`（内置 Node 版本）、`--mirror`（npmmirror 镜像一键设置）、`--skip-repo` / `--keep-dist` / `--no-sha256`；构建完成后自动生成 `dist/sha256sums.txt`。
- `lefthook.yml` 配置入库。

### 🔧 构建链路修复（Linux 构建机）

- **Linux 构建机可完整交叉构建 Windows 安装包，无需 wine**：
  - 归档 7za 按宿主平台自动选择（Linux 用 linux 版；随包的 `tools/7za.exe` 仍为 win 版，供安装器解压归档）。
  - `prepare-runtime` 交叉构建时用宿主 npm 把 pnpm 包装进内置 Node 目录，生成 `pnpm.cmd` / `pnpm.ps1` shim（插件市场 dshmarket 依赖）。
- **修复 `prepare-runtime` Node 就绪检测路径错误**（win32 误检 `node.exe/node.exe`）：此前每次构建都重复下载 Node，断网即失败；现在已就绪自动跳过，离线可复用。
- **修复 `vendor/dsh-memory-evolve` 被 tsdown workspace 构建误纳**导致 `pnpm run build` 报 `Cannot find entry`（该插件是纯 client 包，无 `lib/types/*` host 目标；新增包内 `tsdown.config.ts` 跳过）。
- `readSingleChildDir` 改为先过滤子目录再取唯一项（更健壮）。

### 📚 文档

- 修正失效的 `ELECTRON_BUILDER_BINARIES_MIRROR` 镜像路径（`npmmirror.com/mirrors/…` 已 404，改为 `registry.npmmirror.com/-/binary/…`）。
- 补充网络受限/离线构建（electron-builder 的 nsis/nsis-resources/winCodeSign 从 GitHub 下载的镜像与缓存预置解法）、构建前置条件、已知问题与踩坑（tsdown workspace、WSL DNS、npm registry 重试等）。

### 🧹 杂项

- `pnpm-lock.yaml`：`dsh-memory-evolve` git 依赖协议调整为 `git+ssh`。
- `vendor/cordis/bin.js`：修正可执行权限（100755）。

---

## 这是什么

DeepSeek Harness 的**桌面发行版**：Electron 壳 + 内置免安装 Node.js 运行时 + 预组装 dsh 安装根，**用户无需自行安装 Node.js**，双击即用。开箱即用并**默认启用 5 个第三方插件**，配套 HarmonyOS ArkWeb 客户端。

- 上游：DeepSeek Harness（`@deepseek-ai/dsh-root`，MIT）
- 桌面壳：Electron 33 + electron-builder（Windows NSIS）
- 内置运行时：Node.js v22.19.0（免安装）+ dsh 生产依赖闭包（hoisted 布局）
- 默认 profile：`web`（dsh-base + dsh-web-app）

## 主要特性

- **免装 Node.js**：内置 `runtime/node` 与 `runtime/dsh` 完整闭包，安装即用。
- **默认启用 5 个第三方插件**（web profile 挂载）：
  - `dsh-remote`：SSH 远程开发（多机注册、远程工作区、面向模型的 `rw_*` 工具）。
  - `dshmarket`：可视化插件市场。
  - `dsh-message-edit`：分支式消息编辑（reroll / 重试 / 版本时间线）。
  - `@dsh-external/dsh-vision-toolkit`：图像问答、OCR、界面还原、像素级对比。
  - `dsh-memory-evolve`：跨会话长期记忆与后台自我进化。
- **跨端**：同一 `dsh web:` 服务既可在桌面应用内使用，也可被 `harmony/`（HarmonyOS 客户端）连接。
- **独立用户数据**：`%APPDATA%\dsh-desktop\home`（Windows），与已有 CLI 的 `~/.dsh` 互不干扰。

## 安装与使用

1. 下载 **两个文件** 到同一目录。
2. 运行 `DeepSeek Harness-0.1.2-win-setup.exe`（如遇 SmartScreen 提示，选择「仍要运行」——当前版本未做代码签名）。
3. 首次启动自动初始化用户数据目录并拉起 `dsh web` 服务。
4. 在工作区选择器中选择本地或远程工作区（远程需先在「设置 → 远程工作台」添加机器）。
5. （可选）HarmonyOS 设备：安装 `harmony/` 客户端并填入桌面端显示的 `dsh web:` 地址。

## 升级

- 升级应用版本：只需重新下载并安装新的 exe（`dsh-runtime.7z` 通用，除非 Node/dsh 运行时升级）。

## 校验和（SHA256）

见随包 `sha256sums.txt`：

```
8cfee9f66d8eb8e8eca443d02f19ed70567cfe8ef36698ad29e67e5270825c74  DeepSeek Harness-0.1.2-win-setup.exe
a2428709c3b2aef602dd9de18acafa876748c39e0aaf4ed78332a73f2e26f1bd  dsh-runtime.7z
```

校验命令：

```bash
# Linux / macOS
sha256sum -c sha256sums.txt
# Windows PowerShell（与 sha256sums.txt 中对应行比对）
Get-FileHash '.\DeepSeek Harness-0.1.2-win-setup.exe' -Algorithm SHA256
Get-FileHash '.\dsh-runtime.7z' -Algorithm SHA256
```

哈希不一致请勿安装，并在 Gitee Issues 反馈。

## 已知限制

- 未做代码签名（Windows SmartScreen 会提示）。
- 仅 Windows x64；Linux 用 rpm 全量包（无拆分）。

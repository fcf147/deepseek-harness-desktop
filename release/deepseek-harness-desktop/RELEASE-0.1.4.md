# Release 说明 — DeepSeek Harness 桌面版 0.1.4

> 面向 Gitee Release 页的发布说明。发布时需同时上传 **两个文件**（Windows）：

| 文件 | 大小 | 说明 |
| --- | --- | --- |
| `DeepSeek Harness-0.1.4-win-setup.exe` | ~78 MB | 安装包（< 100MB）：Electron 壳 + 应用代码 + profile 模板 + 7za 解压工具 |
| `dsh-runtime.7z` | ~70 MB | 运行时归档：内置 Node.js v22.19.0 + dsh 生产依赖闭包（含 6 个默认插件 + Windows 平台原生模块） |

**两个文件必须放在同一目录**，安装程序会在安装时自动用内置 7za 把归档解压到 `resources\runtime\`。安装前请先校验 sha256（见文末），exe 与 7z 必须来自同一 Release。

---

## v0.1.4 更新内容（自 v0.1.3）

### 🔧 升级安装：自动卸载旧版本再安装新版本

- **修复升级流程**：此前升级安装依赖 electron-builder 的「覆盖安装」，旧版产物若来自不同构建环境（如 Windows 上构建的 0.1.x 与 Linux 交叉构建的新包）会覆盖失败（文件占用 / 注册表残留 / 安装目录差异），需要手动卸载旧版后才能安装成功。
- **现在安装器会自动完成**（安装向导出现前，`preInit` 阶段）：
  1. **结束正在运行的旧版本进程**（`taskkill`）；
  2. **枚举注册表**（HKCU + HKLM）按应用名定位旧版安装目录；
  3. **静默运行旧版卸载器**（`Uninstall DeepSeek Harness.exe /S`，复制到临时目录执行、`_?=` 防止卸载器自删）等待其完成；
  4. 再以全新安装写入新版本。
- 全新安装（无旧版）不受影响，直接安装。

> 说明：上一版使用的 NSIS `customInit` 钩子在 electron-builder 25 模板中并无调用点（实际未生效），已改为模板真实执行的 `preInit` 钩子。

## v0.1.3 已含（WSL 工作区）

- **默认启用 `dsh-wsl-workspace`**：侧边栏 Settings 旁 **W 按钮**添加 WSL 发行版工作区，bash 与文件工具直接在 WSL 内运行（VS Code Remote-WSL 风格），无需在 WSL 里安装 sshd/工具链；文件管理不经 SSH/SFTP。
- 默认插件共 6 个：`dsh-remote`、`dshmarket`、`dsh-message-edit`、`@dsh-external/dsh-vision-toolkit`、`dsh-memory-evolve`、`dsh-wsl-workspace`。

## 这是什么

DeepSeek Harness 的**桌面发行版**：Electron 壳 + 内置免安装 Node.js 运行时 + 预组装 dsh 安装根，**用户无需自行安装 Node.js**，双击即用。开箱即用并**默认启用 6 个第三方插件**，配套 HarmonyOS ArkWeb 客户端。

- 上游：DeepSeek Harness（`@deepseek-ai/dsh-root`，MIT）
- 桌面壳：Electron 33 + electron-builder（Windows NSIS）
- 内置运行时：Node.js v22.19.0（免安装）+ dsh 生产依赖闭包（hoisted 布局）
- 默认 profile：`web`（dsh-base + dsh-web-app）

## 安装与升级

1. 下载 **两个文件** 到同一目录。
2. 运行 `DeepSeek Harness-0.1.4-win-setup.exe`：
   - **升级**：安装器自动结束旧进程并静默卸载旧版本，然后全新安装新版本（无需手动卸载）。
   - **全新安装**：直接安装。
3. 首次启动自动初始化用户数据目录并拉起 `dsh web` 服务。
4. WSL 用户点侧边栏 **W 按钮** 添加 WSL 工作区。

## 校验和（SHA256）

见随包 `sha256sums.txt`：

```
1126601d5bb1f05d02084698a21919bec9cc037497ffb45d112f7b18a5b7c554  DeepSeek Harness-0.1.4-win-setup.exe
57aa997b3abd283b4fda853f61b47a7fae543989353efde46472a897d89161a1  dsh-runtime.7z
```

校验命令：

```bash
# Linux / macOS
sha256sum -c sha256sums.txt
# Windows PowerShell（与 sha256sums.txt 中对应行比对）
Get-FileHash '.\DeepSeek Harness-0.1.4-win-setup.exe' -Algorithm SHA256
Get-FileHash '.\dsh-runtime.7z' -Algorithm SHA256
```

哈希不一致请勿安装，并在 Gitee Issues 反馈。

## 已知限制

- 未做代码签名（Windows SmartScreen 会提示）。
- 仅 Windows x64；Linux 用 rpm 全量包（无拆分）。
- WSL 工作区的文件工具受 DSH 文件策略约束：`workspace-write` 下写操作限会话工作区内；需写工作区外（如 `/mnt/c`）请将文件策略切到 `danger-full-access`。

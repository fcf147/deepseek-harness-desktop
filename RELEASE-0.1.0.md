# Release 说明 — DeepSeek Harness 桌面版 0.1.0

> 面向 Gitee Release 页的发布说明。发布时需同时上传 **两个文件**（Windows）：

| 文件 | 大小 | 说明 |
| --- | --- | --- |
| `DeepSeek Harness-0.1.0-win-setup.exe` | ~78 MB | 安装包（< 100MB）：Electron 壳 + 应用代码 + profile 模板 + 7za 解压工具 |
| `dsh-runtime.7z` | ~57 MB | 运行时归档：内置 Node.js v22.19.0 + dsh 生产依赖闭包（含 5 个默认插件） |

**两个文件必须放在同一目录**，安装程序会在安装时自动用内置 7za 把归档解压到 `resources\runtime\`。

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
  - `dsh-remote`：SSH 远程开发。设置里的「远程工作台」多机 SSH 注册、工作区选择器中的远程标签页、面向模型的 `rw_*` 工具（`rw_connect`、`rw_exec`、`rw_read_file`、`rw_write_file`、`rw_sync` …）；启动时 `host` 为空，配置机器后即可连接。
  - `dshmarket`：可视化插件市场（浏览 / 搜索 / 一键安装 / 已装管理）。
  - `dsh-message-edit`：分支式消息编辑（reroll / 重试 / 版本时间线）。
  - `@dsh-external/dsh-vision-toolkit`：图像问答、OCR、定位、界面还原、像素级对比。
  - `dsh-memory-evolve`：跨会话长期记忆与后台自我进化（五轨记忆、技能、待办）。
- **跨端**：同一 `dsh web:` 服务既可在桌面应用内使用，也可被 `harmony/`（HarmonyOS 客户端）连接。
- **独立用户数据**：`%APPDATA%\dsh-desktop\home`（Windows），与已有 CLI 的 `~/.dsh` 互不干扰。

## 安装与使用

1. 下载 **两个文件** 到同一目录。
2. 运行 `DeepSeek Harness-0.1.0-win-setup.exe`（如遇 SmartScreen 提示，选择「仍要运行」——当前版本未做代码签名）。
3. 首次启动自动初始化用户数据目录并拉起 `dsh web` 服务。
4. 在工作区选择器中选择本地或远程工作区（远程需先在「设置 → 远程工作台」添加机器）。
5. （可选）HarmonyOS 设备：安装 `harmony/` 客户端并填入桌面端显示的 `dsh web:` 地址。

## 升级

- 升级应用版本：只需重新下载并安装新的 exe（`dsh-runtime.7z` 通用，除非 Node/dsh 运行时升级）。
- 卸载：控制面板卸载；用户数据目录 `%APPDATA%\dsh-desktop` 如需彻底清除请手动删除。

## 校验和（SHA256）

见随包 `SHA256SUMS.txt`：

```
688CB84C8830C2A85849D03138C48EDBB83ADBE65F787E8EAF91F18F99D5FFBB  DeepSeek Harness-0.1.0-win-setup.exe
8AA9C382904EBCB41D1B539DC39C7C3D32A4C32E1663182B5F027626574E4D88  dsh-runtime.7z
```

## 已知限制

- 未做代码签名（Windows SmartScreen 会提示）。
- 仅 Windows x64；Linux 用 rpm 全量包（无拆分）。
- `dsh-memory-evolve` 与视觉工具依赖 GitHub 可达网络（首次使用插件市场/记忆能力时）。

## 许可证

MIT（上游 DeepSeek Harness 为 MIT；桌面壳与补丁见仓库 LICENSE）。

---

*发布仓库：本仓库（deepseek-harness-desktop）。构建与补丁说明见 [README.md](README.md) 与 [patches/README.md](patches/README.md)。*

# DeepSeek Harness 鸿蒙客户端壳（HarmonyOS NEXT）

鸿蒙 NEXT（HarmonyOS 5.0+）**无法直接运行 Node.js/dsh 服务**（非标准 Linux 桌面栈，无官方 Node 运行时），因此本工程是**纯 WebView 客户端壳**：

- dsh 服务运行在 Windows / Linux（红帽系）主机或远程服务器上；
- 鸿蒙设备通过 ArkWeb 组件加载 dsh 的 Web UI；
- 与 SSH 远程开发场景天然契合：手机/平板作为客户端连接运行 dsh 的主机。

## 工程结构

```
harmony/
  AppScope/                     应用级配置（bundleName、图标、标签）
  entry/
    src/main/
      module.json5              模块配置（含 ohos.permission.INTERNET）
      ets/
        entryability/EntryAbility.ets
        pages/Index.ets         设置页 + Web 视图（ArkWeb 加载 dsh UI）
    build-profile.json5
    hvigorfile.ts
  build-profile.json5           工程级构建配置（SDK 5.0.0(12)+）
  hvigorfile.ts
  oh-package.json5
```

## 使用说明

1. 用 **DevEco Studio 5.0+** 打开本目录（首次打开会同步 hvigor 依赖）。
2. 连接鸿蒙设备/模拟器，直接 Run 即可（已在 `module.json5` 申请 INTERNET 权限）。
3. 首次启动显示设置页：填写 dsh 服务地址（默认 `http://127.0.0.1:3080`，远程主机填 `http://主机IP:端口`），点"连接"。
4. 右上角"设置"可随时返回切换服务器地址（已用 preferences 持久化）。

## 依赖前提

- DevEco Studio 5.0.0+，HarmonyOS SDK API 12+。
- 运行 dsh 服务的主机（Windows 桌面版安装包或 Linux rpm 安装后启动），并确保设备与主机网络互通。

## 与 SSH 远程开发的关系

鸿蒙壳本身不跑 dsh 进程，而是访问主机的完整 Web UI（含默认启用的 SSH 远程开发：Settings → 远程工作区、`rw_*` 工具）。若希望鸿蒙设备仅作为 SSH 终端控制远端机器，可在主机 dsh 的"远程工作区"中配置目标服务器，再在鸿蒙壳里连接主机即可。

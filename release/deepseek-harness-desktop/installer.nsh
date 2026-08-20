; dsh-desktop NSIS 自定义安装逻辑（拆分发布 + Node 随包内置）。
;
; 安装包内嵌 Electron 壳 + 模板 + 7za 工具 + 内置 Node（extraResources 自动落盘到
; $INSTDIR\resources\runtime\node\win32-x64）；dsh 安装根在单独的
; dsh-runtime.7z 归档里（与安装包同目录）。
;
; customInstall 在应用文件解压完成后执行（electron-builder installSection.nsh）：
;   1) 检测系统 PATH 中的 Node.js：满足 dsh engines（^22.19.0 || >=24.0.0）时
;      写 .use-system-node 标记，桌面壳优先复用系统 Node（main.js 会做严格版本
;      校验，不满足时自动回退内置 Node）；不满足/未安装则静默使用内置 Node
;      （安装包自带，即"后台静默补齐"，全程离线、无需交互）；
;   2) 用内置 7za 把 dsh-runtime.7z 解压到 $INSTDIR\resources\runtime\。
;      （先补齐 Node 依赖，再安装 harness 本体）
;
; 归档缺失时中止安装并给出明确提示（应用无法工作）。

; ===== 升级路径：先静默卸载旧版本，再继续安装新版本 =====
; electron-builder 默认对已安装版本走「覆盖安装」；旧版产物若来自不同构建
; 环境（如 Windows 上构建的旧包 vs Linux 交叉构建的新包），覆盖会失败
; （文件占用 / 注册表残留 / 安装目录差异）。实测「先卸载再安装」最可靠，
; 故在 preInit（.onInit 中、写文件之前）完成：
;   1) 结束可能正在运行的旧进程；
;   2) 枚举注册表 Uninstall 键（HKCU + HKLM 64 位视图）按 DisplayName 定位旧版；
;   3) 找到旧版卸载器则静默运行（/S 静默；_?= 防止卸载器自删、保证 ExecWait
;      可等待其退出），完成后由安装器全新安装新版本。
!macro preInit
  DetailPrint "检查并结束正在运行的旧版本进程..."
  nsExec::ExecToLog 'taskkill /F /IM "DeepSeek Harness.exe"'
  Sleep 300

  ; 定位旧版安装目录：HKCU（per-user）→ HKLM（per-machine，64 位视图）→ $INSTDIR 兜底
  StrCpy $R9 ""
  StrCpy $R0 0
  ${Do}
    EnumRegKey $R1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall" $R0
    ${If} $R1 == ""
      ${ExitDo}
    ${EndIf}
    ReadRegStr $R2 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R1" "DisplayName"
    ${If} $R2 == "${PRODUCT_NAME}"
      ReadRegStr $R9 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R1" "InstallLocation"
      ${ExitDo}
    ${EndIf}
    IntOp $R0 $R0 + 1
  ${Loop}

  ${If} $R9 == ""
    SetRegView 64
    StrCpy $R0 0
    ${Do}
      EnumRegKey $R1 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall" $R0
      ${If} $R1 == ""
        ${ExitDo}
      ${EndIf}
      ReadRegStr $R2 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R1" "DisplayName"
      ${If} $R2 == "${PRODUCT_NAME}"
        ReadRegStr $R9 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R1" "InstallLocation"
        ${ExitDo}
      ${EndIf}
      IntOp $R0 $R0 + 1
    ${Loop}
  ${EndIf}

  ${If} $R9 == ""
  ${AndIf} ${FileExists} "$INSTDIR\Uninstall ${PRODUCT_NAME}.exe"
    StrCpy $R9 "$INSTDIR"
  ${EndIf}

  ${If} $R9 != ""
  ${AndIf} ${FileExists} "$R9\Uninstall ${PRODUCT_NAME}.exe"
    DetailPrint "检测到旧版本（$R9），先静默卸载..."
    ; 复制卸载器到临时目录再运行：卸载器会清空安装目录（_?= 阻止它删掉自己）
    StrCpy $R8 "$PLUGINSDIR\old-uninstaller.exe"
    CopyFiles /SILENT "$R9\Uninstall ${PRODUCT_NAME}.exe" "$R8"
    ${If} ${FileExists} "$R8"
      ExecWait '"$R8" /S _?=$R9'
    ${Else}
      ExecWait '"$R9\Uninstall ${PRODUCT_NAME}.exe" /S _?=$R9'
    ${EndIf}
    DetailPrint "旧版本卸载完成，继续安装新版本。"
  ${EndIf}
!macroend

!macro customInstall
  ; ===== 1) 检测系统 Node.js，决定复用系统 Node 或静默使用内置 Node =====
  ; 内置 Node 已随安装包解压（extraResources），无需任何下载；
  ; 仅当系统 PATH 中存在满足 engines（^22.19.0 || >=24.0.0）的 Node 时写
  ; .use-system-node 标记让桌面壳优先复用（宽松启发式：v22.*/v24.*/v25.*/v26.*，
  ; main.js 会做严格 semver 校验并在不满足时回退内置 Node）。
  DetailPrint "检测系统 Node.js 状态..."
  nsExec::ExecToStack 'node --version'
  Pop $0
  Pop $1
  ${If} $0 == 0
    StrCpy $2 $1 4
    ${If} $2 == "v22."
    ${OrIf} $2 == "v24."
    ${OrIf} $2 == "v25."
    ${OrIf} $2 == "v26."
      DetailPrint "检测到系统 Node.js $1（满足要求），写入 .use-system-node 标记复用系统 Node。"
      nsExec::ExecToLog 'cmd /c type nul > "$INSTDIR\resources\runtime\node\.use-system-node"'
    ${Else}
      DetailPrint "系统 Node.js $1 版本不满足要求（^22.19.0 || >=24.0.0），静默使用内置 Node。"
    ${EndIf}
  ${Else}
    DetailPrint "未检测到系统 Node.js，静默使用内置 Node（后台补齐依赖）。"
  ${EndIf}

  ; ===== 2) 解压 dsh 运行时（Node 依赖就绪后再装 harness 本体） =====
  ${If} ${FileExists} "$EXEDIR\dsh-runtime.7z"
    DetailPrint "正在解压 dsh 运行时 (dsh-runtime.7z) ..."
    nsExec::ExecToStack '"$INSTDIR\resources\tools\7za.exe" x "$EXEDIR\dsh-runtime.7z" -y -o"$INSTDIR\resources\runtime"'
    Pop $0
    ${If} $0 != 0
      MessageBox MB_OK|MB_ICONSTOP "dsh 运行时解压失败 (exit $0)。请确认 dsh-runtime.7z 与安装包放在同一目录。"
      Quit
    ${EndIf}
    DetailPrint "dsh 运行时解压完成。"
  ${Else}
    MessageBox MB_OK|MB_ICONSTOP "未找到 dsh-runtime.7z（应与安装包放在同一目录）。安装中止。"
    Quit
  ${EndIf}
!macroend

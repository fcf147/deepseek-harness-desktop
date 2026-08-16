; dsh-desktop NSIS 自定义安装逻辑（拆分发布）。
;
; 安装包只含 Electron 壳 + 模板 + 7za 工具；node 运行时与 dsh 安装根在
; 单独的 dsh-runtime.7z 归档里（与安装包同目录）。customInstall 在应用
; 文件解压完成后执行（electron-builder installSection.nsh），此处用内置
; 7za 把归档解压到 $INSTDIR\resources\runtime\，与 main.js 的路径约定
; （process.resourcesPath/runtime）保持一致。
;
; 归档缺失时中止安装并给出明确提示（应用无法工作）。

!macro customInstall
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

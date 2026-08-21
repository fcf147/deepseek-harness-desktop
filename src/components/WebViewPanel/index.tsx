import type { ServiceRuntime } from '../../api/wsl'

/**
 * WebView 面板：服务运行后使用 Tauri 的 <webview> 嵌入目标 Web UI。
 * Tauri 2.x 通过 @tauri-apps/api/webview 或原生 webview 标签嵌入外部页面。
 */
export function WebViewPanel({ runtime }: { runtime: ServiceRuntime | null }) {
  if (!runtime || !runtime.url) {
    return (
      <div className="webview-placeholder">
        <p>服务未运行</p>
        <p className="muted">在左侧选择服务并点击「启动」以加载 Web UI。</p>
      </div>
    )
  }
  return (
    <div className="webview-wrap">
      <webview className="webview" src={runtime.url} allowpopups />
    </div>
  )
}

export default WebViewPanel

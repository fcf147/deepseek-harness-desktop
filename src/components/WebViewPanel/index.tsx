import type { ServiceRuntime } from '../../api/wsl'

/**
 * WebView 面板：服务运行后用 Tauri 的 <webview> 标签嵌入目标 Web UI。
 *
 * 使用 <webview>（而非 iframe）的原因：生产构建主 webview 走 https://tauri.localhost，
 * iframe 加载 http://127.0.0.1:3080 会因混合内容被 WebView2 阻止而黑屏；
 * <webview> 是独立子 webview，加载外部 URL 不受混合内容限制。
 *
 * 需要 capabilities 授予 core:webview:default（见 src-tauri/capabilities/default.json）。
 * key={url} 保证服务重启/换 URL 时重建标签，避免加载旧页面。
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
      <webview
        key={runtime.url}
        className="webview"
        src={runtime.url}
        allowpopups
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  )
}

export default WebViewPanel

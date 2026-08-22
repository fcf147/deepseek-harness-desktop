import type { ServiceRuntime } from '../../api/wsl'

/**
 * WebView 面板：服务运行后用 <iframe> 嵌入目标 Web UI。
 *
 * 使用 <iframe> 而非 Tauri <webview> 标签/WebviewWindow 的原因：
 * - <webview> 标签加载外部 http 在 Tauri 2 不可靠（黑屏）
 * - WebviewWindow 独立窗口曾导致整个程序卡死
 * - iframe 是标准 HTML 元素，稳定可靠
 *
 * 前提：tauri.conf.json 主窗口已设 useHttpsScheme=false（http://tauri.localhost），
 * 否则生产 https 页面下 iframe 加载 http://127.0.0.1 会因混合内容被阻止。
 * key={url} 保证服务重启/换 URL 时重建 iframe。
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
      <iframe
        key={runtime.url}
        className="webview"
        src={runtime.url}
        title={runtime.id}
        allowFullScreen
      />
    </div>
  )
}

export default WebViewPanel

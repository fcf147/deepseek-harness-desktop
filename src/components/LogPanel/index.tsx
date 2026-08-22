import { useEffect, useRef } from 'react'

export interface LogLine {
  ts: number
  stream: 'info' | 'error' | 'out'
  text: string
}

interface LogPanelProps {
  lines: LogLine[]
  collapsed: boolean
  onExpand: () => void
  onCollapse: () => void
}

export function LogPanel({ lines, collapsed, onExpand, onCollapse }: LogPanelProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [lines])

  // 折叠态：底部窄条，仅显示日志图标与展开按钮
  if (collapsed) {
    return (
      <div className="log-panel-collapsed">
        <span className="log-panel-label" title="日志">{lines.length} 行</span>
        <button className="icon-btn" title="展开日志" onClick={onExpand}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div className="log-panel-wrap">
      <div className="log-panel-head">
        <span>日志</span>
        <button className="icon-btn" title="最小化日志" onClick={onCollapse}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 14h16M4 20h16" />
          </svg>
        </button>
      </div>
      <div className="log-panel" ref={ref}>
        {lines.length === 0 && <div className="log-empty">暂无日志</div>}
        {lines.map((l, i) => (
          <div key={i} className={`log-line log-${l.stream}`}>
            <span className="log-ts">{new Date(l.ts).toLocaleTimeString()}</span>
            <span className="log-text">{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default LogPanel

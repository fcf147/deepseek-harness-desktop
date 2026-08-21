import { useEffect, useRef } from 'react'

export interface LogLine {
  ts: number
  stream: 'info' | 'error' | 'out'
  text: string
}

export function LogPanel({ lines }: { lines: LogLine[] }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [lines])
  return (
    <div className="log-panel" ref={ref}>
      {lines.length === 0 && <div className="log-empty">暂无日志</div>}
      {lines.map((l, i) => (
        <div key={i} className={`log-line log-${l.stream}`}>
          <span className="log-ts">{new Date(l.ts).toLocaleTimeString()}</span>
          <span className="log-text">{l.text}</span>
        </div>
      ))}
    </div>
  )
}

export default LogPanel

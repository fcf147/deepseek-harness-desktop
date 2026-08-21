import type { ServiceConfig } from '../../config/services'
import type { WslState, ServiceRuntime } from '../../api/wsl'
import StatusBadge from '../StatusBadge'

interface SidebarProps {
  services: ServiceConfig[]
  wsl: WslState | null
  runtimes: Record<string, ServiceRuntime>
  selectedId: string | null
  onSelect: (id: string) => void
  onInstallWsl: () => void
  onInstall: (id: string) => void
  onStart: (id: string) => void
  onStop: (id: string) => void
}

export function Sidebar(props: SidebarProps) {
  const { services, wsl, runtimes, selectedId, onSelect, onInstallWsl, onInstall, onStart, onStop } = props
  return (
    <aside className="sidebar">
      <div className="brand">WebUI Shell</div>

      <section className="sidebar-section">
        <div className="section-title">WSL 后端</div>
        {!wsl && <div className="muted">检测中…</div>}
        {wsl && (
          <div className="wsl-state">
            <div className="row">
              <StatusBadge status={wsl.status} />
              <span className="muted">{wsl.platform}</span>
            </div>
            {wsl.default_distro && (
              <div className="muted small">默认发行版：{wsl.default_distro}</div>
            )}
            {wsl.hint && <div className="hint">{wsl.hint}</div>}
            {(wsl.status === 'not_installed' || wsl.status === 'no_distro') && (
              <button className="btn" onClick={onInstallWsl}>
                安装 / 启用 WSL
              </button>
            )}
          </div>
        )}
      </section>

      <section className="sidebar-section">
        <div className="section-title">服务</div>
        {services.map((s) => {
          const rt = runtimes[s.id]
          const active = selectedId === s.id
          return (
            <div
              key={s.id}
              className={`service-item ${active ? 'active' : ''}`}
              onClick={() => onSelect(s.id)}
            >
              <div className="service-name">{s.label}</div>
              {rt && <StatusBadge status={rt.status} />}
              <div className="service-actions">
                {rt?.status === 'not_installed' && (
                  <button className="btn small" onClick={(e) => { e.stopPropagation(); onInstall(s.id) }}>
                    安装
                  </button>
                )}
                {(rt?.status === 'installed' || rt?.status === 'stopped') && (
                  <button className="btn small" onClick={(e) => { e.stopPropagation(); onStart(s.id) }}>
                    启动
                  </button>
                )}
                {rt?.status === 'running' && (
                  <button className="btn small danger" onClick={(e) => { e.stopPropagation(); onStop(s.id) }}>
                    停止
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </section>
    </aside>
  )
}

export default Sidebar

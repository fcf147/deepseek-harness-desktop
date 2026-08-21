import type { ServiceConfig } from '../../config/services'
import type { WslState, ServiceRuntime } from '../../api/wsl'
import StatusBadge from '../StatusBadge'

interface SidebarProps {
  services: ServiceConfig[]
  wsl: WslState | null
  runtimes: Record<string, ServiceRuntime>
  selectedId: string | null
  selectedDistro: string | null
  onSelect: (id: string) => void
  onSelectDistro: (name: string) => void
  onInstallWsl: () => void
  onInstall: (id: string, distro?: string) => void
  onStart: (id: string, distro?: string) => void
  onStop: (id: string) => void
}

export function Sidebar(props: SidebarProps) {
  const {
    services, wsl, runtimes, selectedId, selectedDistro,
    onSelect, onSelectDistro, onInstallWsl, onInstall, onStart, onStop,
  } = props
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
            {wsl.hint && <div className="hint">{wsl.hint}</div>}
            {(wsl.status === 'not_installed' || wsl.status === 'no_distro') && (
              <button className="btn" onClick={onInstallWsl}>
                安装 / 启用 WSL
              </button>
            )}
            {wsl.distros.length > 0 && (
              <div className="distro-list">
                <div className="muted small">发行版（点击选择）：</div>
                {wsl.distros.map((d) => {
                  const active = selectedDistro === d.name
                  return (
                    <div
                      key={d.name}
                      className={`distro-item ${active ? 'active' : ''}`}
                      onClick={() => onSelectDistro(d.name)}
                      title={d.state ? `状态: ${d.state}` : undefined}
                    >
                      <span className="distro-name">{d.name}</span>
                      {d.is_default && <span className="muted small">默认</span>}
                      {d.state && <StatusBadge status={d.state.toLowerCase()} label={d.state} />}
                    </div>
                  )
                })}
              </div>
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
                  <button className="btn small" onClick={(e) => { e.stopPropagation(); onInstall(s.id, selectedDistro ?? undefined) }}>
                    安装
                  </button>
                )}
                {(rt?.status === 'installed' || rt?.status === 'stopped') && (
                  <button className="btn small" onClick={(e) => { e.stopPropagation(); onStart(s.id, selectedDistro ?? undefined) }}>
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

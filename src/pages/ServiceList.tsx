import type { ServiceConfig } from '../config/services'
import type { ServiceRuntime } from '../api/wsl'
import StatusBadge from '../components/StatusBadge'

interface Props {
  services: ServiceConfig[]
  runtimes: Record<string, ServiceRuntime>
  onSelect: (id: string) => void
}

export function ServiceList({ services, runtimes, onSelect }: Props) {
  return (
    <div className="service-list">
      {services.map((s) => {
        const rt = runtimes[s.id]
        return (
          <div key={s.id} className="service-row" onClick={() => onSelect(s.id)}>
            <div>
              <div className="service-name">{s.label}</div>
              <div className="muted small">{s.base_url}</div>
            </div>
            {rt && <StatusBadge status={rt.status} />}
          </div>
        )
      })}
    </div>
  )
}

export default ServiceList

const COLOR: Record<string, string> = {
  running: '#22c55e',
  installed: '#3b82f6',
  starting: '#eab308',
  installing: '#eab308',
  stopped: '#6b7280',
  not_installed: '#9ca3af',
  error: '#ef4444',
  ready: '#22c55e',
  not_supported: '#ef4444',
  no_distro: '#eab308',
  needs_reboot: '#eab308',
  unknown: '#9ca3af',
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const color = COLOR[status] || '#9ca3af'
  return (
    <span className="status-badge" style={{ backgroundColor: color }}>
      {label || status}
    </span>
  )
}

export default StatusBadge

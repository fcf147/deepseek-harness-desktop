import React from 'react'
import type { ServiceConfig } from '../config/services'
import type { ServiceRuntime } from '../api/wsl'

interface Props {
  service: ServiceConfig
  runtime: ServiceRuntime | null
  onInstall: () => void
  onStart: () => void
  onStop: () => void
}

export function ServiceDetail({ service, runtime, onInstall, onStart, onStop }: Props) {
  const status = runtime?.status ?? 'unknown'
  return (
    <div className="service-detail">
      <h2>{service.label}</h2>
      <div className="muted small">模式：{service.mode}</div>
      <div className="muted small">地址：{service.base_url}</div>

      <div className="detail-actions">
        {status === 'not_installed' && (
          <button className="btn" onClick={onInstall}>一键安装</button>
        )}
        {(status === 'installed' || status === 'stopped') && (
          <button className="btn" onClick={onStart}>启动</button>
        )}
        {status === 'running' && (
          <button className="btn danger" onClick={onStop}>停止</button>
        )}
      </div>

      {runtime?.error && <div className="hint">{runtime.error}</div>}
      {runtime?.url && (
        <div className="muted small">运行中：{runtime.url}</div>
      )}
    </div>
  )
}

export default ServiceDetail

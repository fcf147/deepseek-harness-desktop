import React, { useEffect, useState, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import WebViewPanel from './components/WebViewPanel'
import LogPanel, { type LogLine } from './components/LogPanel'
import { loadServices, serviceList, type ServiceConfig, type ServicesFile } from './config/services'
import * as wslApi from './api/wsl'

export default function App() {
  const [cfg, setCfg] = useState<ServicesFile | null>(null)
  const [services, setServices] = useState<ServiceConfig[]>([])
  const [wsl, setWsl] = useState<wslApi.WslState | null>(null)
  const [runtimes, setRuntimes] = useState<Record<string, wslApi.ServiceRuntime>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [logs, setLogs] = useState<LogLine[]>([])
  const [busy, setBusy] = useState(false)

  const appendLog = useCallback((stream: LogLine['stream'], text: string) => {
    setLogs((prev) => [...prev.slice(-300), { ts: Date.now(), stream, text }])
  }, [])

  const refreshWsl = useCallback(async () => {
    try {
      const s = await wslApi.getWslState()
      setWsl(s)
    } catch (e) {
      appendLog('error', `WSL 检测失败: ${String(e)}`)
    }
  }, [appendLog])

  useEffect(() => {
    loadServices().then((c) => {
      setCfg(c)
      setServices(serviceList(c))
    }).catch((e) => appendLog('error', String(e)))
    refreshWsl()
  }, [appendLog, refreshWsl])

  const setRuntime = useCallback((rt: wslApi.ServiceRuntime) => {
    setRuntimes((prev) => ({ ...prev, [rt.id]: rt }))
  }, [])

  const handleInstallWsl = async () => {
    setBusy(true)
    appendLog('info', '请求安装 WSL…')
    try {
      const r = await wslApi.installWsl()
      appendLog(r.triggered ? 'info' : 'error', r.message)
    } finally {
      setBusy(false)
      await refreshWsl()
    }
  }

  const handleInstall = async (id: string) => {
    setBusy(true)
    setRuntime({ id, status: 'installing', url: null, version: null })
    try {
      await wslApi.installService(id)
      appendLog('info', `${id} 安装完成`)
      setRuntime({ id, status: 'installed', url: null, version: null })
    } catch (e) {
      appendLog('error', `安装失败: ${String(e)}`)
      setRuntime({ id, status: 'error', url: null, version: null, error: String(e) })
    } finally {
      setBusy(false)
    }
  }

  const handleStart = async (id: string) => {
    const svc = services.find((s) => s.id === id)
    if (!svc) return
    setBusy(true)
    setRuntime({ id, status: 'starting', url: null, version: null })
    try {
      const rt = await wslApi.startService(id, {
        autostartCmd: svc.autostart.cmd,
        healthUrl: svc.health,
      })
      setRuntime(rt)
      appendLog(rt.status === 'running' ? 'info' : 'error', `${id} -> ${rt.url ?? rt.error}`)
    } catch (e) {
      setRuntime({ id, status: 'error', url: null, version: null, error: String(e) })
      appendLog('error', `启动失败: ${String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const handleStop = async (id: string) => {
    setBusy(true)
    try {
      await wslApi.stopService(id)
      setRuntime({ id, status: 'stopped', url: null, version: null })
    } catch (e) {
      appendLog('error', `停止失败: ${String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const selectedService = services.find((s) => s.id === selectedId) ?? null
  const selectedRuntime = selectedId ? runtimes[selectedId] ?? null : null

  return (
    <div className="app">
      <Sidebar
        services={services}
        wsl={wsl}
        runtimes={runtimes}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onInstallWsl={handleInstallWsl}
        onInstall={handleInstall}
        onStart={handleStart}
        onStop={handleStop}
      />
      <main className="main">
        <div className="main-header">
          <span>{selectedService ? selectedService.label : 'WebUI Shell'}</span>
          {busy && <span className="busy">处理中…</span>}
        </div>
        {selectedService ? (
          <ServiceDetailBody
            service={selectedService}
            runtime={selectedRuntime}
            onInstall={() => handleInstall(selectedService.id)}
            onStart={() => handleStart(selectedService.id)}
            onStop={() => handleStop(selectedService.id)}
            webview={
              <WebViewPanel runtime={selectedRuntime} />
            }
          />
        ) : (
          <div className="webview-placeholder">
            <p>从左侧选择一个服务</p>
          </div>
        )}
        <LogPanel lines={logs} />
      </main>
    </div>
  )
}

// 详情页 + WebView 组合（保持组件树简洁）
function ServiceDetailBody({
  service,
  runtime,
  onInstall,
  onStart,
  onStop,
  webview,
}: {
  service: ServiceConfig
  runtime: wslApi.ServiceRuntime | null
  onInstall: () => void
  onStart: () => void
  onStop: () => void
  webview: React.ReactNode
}) {
  const status = runtime?.status ?? 'unknown'
  return (
    <div className="detail-and-webview">
      <div className="detail-bar">
        <div className="muted small">{service.mode} · {service.base_url}</div>
        <div className="detail-actions">
          {status === 'not_installed' && <button className="btn" onClick={onInstall}>一键安装</button>}
          {(status === 'installed' || status === 'stopped') && <button className="btn" onClick={onStart}>启动</button>}
          {status === 'running' && <button className="btn danger" onClick={onStop}>停止</button>}
        </div>
        {runtime?.error && <div className="hint">{runtime.error}</div>}
      </div>
      {webview}
    </div>
  )
}

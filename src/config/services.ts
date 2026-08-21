// services.yaml 加载与解析
// ----------------------------------------------------------------------------
// 壳启动时动态加载 config/services.yaml 中的服务声明。
// 为不引入额外 yaml 依赖，这里使用一个最小化的 YAML 解析器，仅覆盖
// README 中定义的字段结构（见 config/services.yaml 注释）。

export interface ServiceConfig {
  id: string
  label: string
  mode: 'webview_embed' | 'api_proxy'
  base_url: string
  ui_path: string
  health: string
  install: { type: string; script_url?: string; package?: string }
  autostart: { cmd: string }
  depends_on: string[]
}

export interface ServicesFile {
  services: Record<string, ServiceConfig>
}

/** 最小化 YAML 解析：仅支持本仓库 services.yaml 的结构层级。 */
export function parseServicesYaml(text: string): ServicesFile {
  const services: Record<string, ServiceConfig> = {}
  const lines = text.split(/\r?\n/)
  let curId: string | null = null
  let cur: any = null
  let section: string | null = null // 当前子块：install / autostart

  const set = (key: string, val: string) => {
    if (!cur) return
    if (section === 'install') cur.install[key] = val
    else if (section === 'autostart') cur.autostart[key] = val
    else cur[key] = val
  }

  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue
    const indent = raw.length - raw.trimStart().length
    const line = raw.trim()

    if (line.startsWith('services:')) {
      continue
    }
    const svcMatch = /^(\S+):\s*$/.exec(line)
    if (indent === 2 && svcMatch && svcMatch[1] !== 'install' && svcMatch[1] !== 'autostart') {
      curId = svcMatch[1]
      cur = { id: curId, install: {}, autostart: {}, depends_on: [] }
      services[curId] = cur
      section = null
      continue
    }
    if (indent === 4 && (line === 'install:' || line === 'autostart:')) {
      section = line.replace(':', '')
      continue
    }
    const kv = /^(\S+):\s*(.+)$/.exec(line)
    if (kv) {
      const key = kv[1]
      let val: any = kv[2].replace(/^["']|["']$/g, '')
      if (key === 'depends_on') {
        val = kv[2].replace(/[[\]]/g, '').split(',').map((s) => s.trim()).filter(Boolean)
      }
      set(key, val)
    }
  }
  return { services }
}

/**
 * 加载服务声明。
 *
 * 注意：绿色版（bundle.active=false）不打包 config/services.yaml，
 * 运行时 fetch 可能返回 Tauri 404 页或空内容，导致服务列表为空。
 * 因此以内置 FALLBACK 为唯一可靠来源：即使 fetch 成功但解析为空，
 * 也回退到 FALLBACK，保证至少存在 deepseek_harness 服务。
 */
export async function loadServices(): Promise<ServicesFile> {
  try {
    const res = await fetch('config/services.yaml')
    if (res.ok) {
      const parsed = parseServicesYaml(await res.text())
      if (Object.keys(parsed.services).length > 0) {
        return parsed
      }
    }
  } catch {
    /* 忽略，走兜底 */
  }
  return { services: FALLBACK }
}

const FALLBACK: Record<string, ServiceConfig> = {
  deepseek_harness: {
    id: 'deepseek_harness',
    label: 'DeepSeek Harness',
    mode: 'webview_embed',
    base_url: 'http://127.0.0.1:3080',
    ui_path: '/',
    health: 'http://127.0.0.1:3080/',
    install: { type: 'wsl_script', script_url: 'scripts/bootstrap-dsh.sh' },
    // --no-open 禁止 dsh 自动打开浏览器（壳内用 WebView 嵌入）
    autostart: { cmd: 'dsh web --port 3080 --no-open' },
    depends_on: ['wsl'],
  },
}

export function serviceList(file: ServicesFile): ServiceConfig[] {
  return Object.values(file.services)
}

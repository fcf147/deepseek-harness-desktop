// API 代理封装（Tauri invoke）
// 对应 src-tauri/src/commands.rs 的 proxy_request，用于 api_proxy 模式服务（如 Ollama）。
import { invoke } from '@tauri-apps/api/core'

export interface ProxyRequest {
  url: string
  method?: string
  body?: string
}

export async function proxy(req: ProxyRequest): Promise<string> {
  return invoke('proxy_request', { req })
}

// 统一封装：优先走 Tauri 代理（绕过 CORS），非 Tauri 环境退化到 fetch。
export async function callServiceAPI(baseUrl: string, path: string, opts?: RequestInit): Promise<any> {
  const url = `${baseUrl}${path}`
  // @ts-ignore - __TAURI__ 在 Tauri 运行时存在
  if (typeof window !== 'undefined' && (window as any).__TAURI__) {
    return JSON.parse(
      await proxy({
        url,
        method: opts?.method ?? 'GET',
        body: opts?.body,
      }),
    )
  }
  return fetch(url, opts).then((r) => r.json())
}

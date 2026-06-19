export type TransportType = 'ipc' | 'http'

const TRANSPORT_KEY = 'app-transport'
const HEALTH_TIMEOUT = 3000
const HTTP_PORT_RANGE = { from: 34116, to: 34126 }

interface ApiResult<T = unknown> {
  data?: T
  error?: {
    message: string
    code?: string
    category?: string
  }
}

let activeTransport: TransportType | null = null
let discoveredPort: number | null = null

/**
 * 全局 401 拦截回调
 *
 * 当 transport 在 HTTP 收到 401 或 IPC 收到 UNAUTHORIZED code 时触发。
 * 采用 2 次累积失败才触发的防抖策略，避免单次网络闪断误登出。
 * AuthContext 用此清空 user/token + 跳转到登录页。
 */
let onAuthFailure: (() => void) | null = null
let authFailCount = 0
let authFailTimer: ReturnType<typeof setTimeout> | null = null
const AUTH_FAIL_RESET_MS = 5000 // 5 秒内累积 2 次 401 才触发

export function setOnAuthFailure(handler: (() => void) | null): void {
  onAuthFailure = handler
}

function notifyAuthFailure(): void {
  authFailCount++
  if (authFailTimer) clearTimeout(authFailTimer)
  authFailTimer = setTimeout(() => {
    authFailCount = 0
    authFailTimer = null
  }, AUTH_FAIL_RESET_MS)

  if (authFailCount >= 2 && onAuthFailure) {
    authFailCount = 0
    if (authFailTimer) clearTimeout(authFailTimer)
    authFailTimer = null
    try {
      onAuthFailure()
    } catch (err) {
      console.warn('[transport] onAuthFailure handler threw:', err)
    }
  }
}

function getElectronHttpPort(): number | null {
  try {
    const ep = window.electronAPI
    if (ep?.httpPort && typeof ep.httpPort === 'number') return ep.httpPort
  } catch {
    // Ignore access errors
  }
  return null
}

export function getActiveTransport(): TransportType | null {
  return activeTransport
}

export function setActiveTransport(t: TransportType): void {
  activeTransport = t
}

function getForcedTransport(): TransportType | null {
  try {
    const params = new URLSearchParams(window.location.search)
    const forced = params.get('transport')
    if (forced === 'ipc' || forced === 'http') return forced
  } catch {
    // Ignore access errors
  }
  return null
}

async function callIPC<T>(channel: string, args: unknown[]): Promise<T> {
  const electronAPI = window.electronAPI
  if (!electronAPI?.invoke) {
    throw new Error('IPC: electronAPI not available')
  }
  const result = (await electronAPI.invoke(channel, ...args)) as ApiResult<T>
  if (result.error) {
    // UNAUTHORIZED code 触发全局清空 user + token + 跳转登录
    if (result.error.code === 'UNAUTHORIZED') notifyAuthFailure()
    throw Object.assign(new Error(result.error.message), {
      code: result.error.code,
      category: result.error.category
    })
  }
  return result.data as T
}

function getHttpToken(): string {
  try {
    const ep = window.electronAPI
    if (ep?.httpToken && typeof ep.httpToken === 'string') return ep.httpToken
  } catch {
    // Ignore access errors
  }
  return ''
}

async function tryHttpPort<T>(port: number, channel: string, args: unknown[]): Promise<T | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const url = `http://127.0.0.1:${port}/api/call`
    const token = getHttpToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ channel, args }),
      signal: controller.signal
    })
    if (!response.ok) {
      const errBody = await response.json().catch(() => null)
      const errMsg = errBody?.error?.message || `HTTP ${response.status}`
      // 401 触发全局清空 user + token + 跳转登录（解决"操作后丢失所有权限"）
      if (response.status === 401) notifyAuthFailure()
      throw Object.assign(new Error(errMsg), {
        code: errBody?.error?.code,
        category: errBody?.error?.category
      })
    }
    const result: ApiResult<T> = await response.json()
    if (result.error) {
      throw Object.assign(new Error(result.error.message), {
        code: result.error.code,
        category: result.error.category
      })
    }
    return result.data as T
  } catch (err) {
    // Network errors (port not listening) → return null to try next port
    if (err instanceof TypeError || (err instanceof Error && err.name === 'AbortError')) {
      return null
    }
    // Handler-level error (server responded but handler returned error) → propagate
    throw err
  } finally {
  }
}

async function callHTTP<T>(channel: string, args: unknown[]): Promise<T> {
  if (discoveredPort) {
    const result = await tryHttpPort<T>(discoveredPort, channel, args)
    if (result !== null) return result
    discoveredPort = null
  }

  const electronPort = getElectronHttpPort()
  if (electronPort) {
    const result = await tryHttpPort<T>(electronPort, channel, args)
    if (result !== null) {
      discoveredPort = electronPort
      return result
    }
  }

  for (let port = HTTP_PORT_RANGE.from; port <= HTTP_PORT_RANGE.to; port++) {
    const result = await tryHttpPort<T>(port, channel, args)
    if (result !== null) {
      discoveredPort = port
      return result
    }
  }

  throw new Error(
    `HTTP API unreachable (tried ports ${HTTP_PORT_RANGE.from}-${HTTP_PORT_RANGE.to})`
  )
}

export async function call<T>(channel: string, args: unknown[] = []): Promise<T> {
  const forced = getForcedTransport()

  if (forced) {
    activeTransport = forced
    return forced === 'http' ? callHTTP<T>(channel, args) : callIPC<T>(channel, args)
  }

  const transport = activeTransport || 'ipc'

  if (transport === 'http') {
    try {
      return await callHTTP<T>(channel, args)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('HTTP API unreachable')) {
        activeTransport = null
      } else {
        throw err
      }
    }
  }

  try {
    const result = await callIPC<T>(channel, args)
    activeTransport = 'ipc'
    return result
  } catch (ipcErr) {
    try {
      const result = await callHTTP<T>(channel, args)
      activeTransport = 'http'
      console.warn(
        `[transport] IPC failed (${(ipcErr as Error).message}), switched to HTTP: ${channel}`
      )
      return result
    } catch (httpErr) {
      const httpMsg = httpErr instanceof Error ? httpErr.message : String(httpErr)
      if (!httpMsg.includes('HTTP API unreachable')) {
        throw httpErr
      }
      console.error(
        `[transport] Both failed for "${channel}": IPC=${(ipcErr as Error).message}, HTTP=${httpMsg}`
      )
      throw ipcErr
    }
  }
}

export async function checkHTTPHealth(): Promise<boolean> {
  const electronPort = getElectronHttpPort()
  const ports = electronPort
    ? [electronPort]
    : Array.from(
        { length: HTTP_PORT_RANGE.to - HTTP_PORT_RANGE.from + 1 },
        (_, i) => HTTP_PORT_RANGE.from + i
      )

  for (const port of ports) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT)
      const resp = await fetch(`http://127.0.0.1:${port}/api/health`, {
        method: 'GET',
        signal: controller.signal
      })
      clearTimeout(timer)
      if (resp.ok) return true
    } catch {
      continue
    }
  }
  return false
}

export function checkIPCHealth(): boolean {
  return !!window.electronAPI?.invoke
}

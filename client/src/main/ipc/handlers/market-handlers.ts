/**
 * @file 市场认证 IPC 处理器
 * @description 包含登录、注册、用户信息、注销等 Marketplace 认证相关处理器。
 */
import { register, Services } from '../registry'
import { createLogger } from '../../utils/logger'

const logger = createLogger('ipc')

export function registerMarketHandlers(services: Services): void {
  const { store } = services

  register('market:login', async (username, password) => {
    const serverUrl = (store.getSetting('marketplace_server_url') || 'http://localhost:3400').replace(/\/+$/, '')
    const apiKey = store.getSetting('marketplace_api_key')
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)
    let resp: Response
    try {
      resp = await fetch(`${serverUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ username, password }),
        signal: controller.signal
      })
    } catch (err) {
      clearTimeout(timeoutId)
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('aborted') || msg.includes('AbortError')) {
        throw new Error(`登录超时（3s）：无法连接 ${serverUrl}`)
      }
      throw new Error(`无法连接服务器 ${serverUrl}: ${msg}`)
    }
    clearTimeout(timeoutId)
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      throw new Error(
        (err as { error?: { message?: string } }).error?.message || `HTTP ${resp.status}`
      )
    }
    const data = (await resp.json()) as {
      data?: {
        token?: string
        user?: { id: string; username: string; displayName: string; role: string }
      }
    }
    if (!data.data?.token || !data.data?.user) {
      throw new Error('服务器返回数据格式错误：缺少 token 或 user')
    }
    store.setSetting('marketplace_jwt', data.data.token)
    store.setSetting('marketplace_user', JSON.stringify(data.data.user))
    return data.data
  })

  register('market:getUser', async () => {
    const raw = store.getSetting('marketplace_user')
    const token = store.getSetting('marketplace_jwt')
    if (!raw || !token) return null

    try {
      const serverUrl = store.getSetting('marketplace_server_url') || 'http://localhost:3400'
      const resp = await fetch(`${serverUrl}/api/users/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!resp.ok) {
        store.deleteSetting('marketplace_jwt')
        store.deleteSetting('marketplace_user')
        return null
      }
      const data = await resp.json()
      return data.data ?? null
    } catch (err) {
      logger.warn('market:getUser failed', { error: String(err) })
      return null
    }
  })

  register('market:logout', () => {
    store.deleteSetting('marketplace_jwt')
    store.deleteSetting('marketplace_user')
    return null
  })

  register('market:register', async (username, password, displayName) => {
    const serverUrl = (store.getSetting('marketplace_server_url') || 'http://localhost:3400').replace(/\/+$/, '')
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    let resp: Response
    try {
      resp = await fetch(`${serverUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, displayName }),
        signal: controller.signal
      })
    } catch (err) {
      clearTimeout(timeoutId)
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('aborted') || msg.includes('AbortError')) {
        throw new Error(`注册超时（5s）：无法连接 ${serverUrl}`)
      }
      throw new Error(`无法连接服务器 ${serverUrl}: ${msg}`)
    }
    clearTimeout(timeoutId)
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      throw new Error(
        (err as { error?: { message?: string } }).error?.message || `HTTP ${resp.status}`
      )
    }
    const data = (await resp.json()) as {
      data?: {
        token?: string
        user?: { id: string; username: string; displayName: string; role: string }
      }
    }
    if (data.data?.token) {
      store.setSetting('marketplace_jwt', data.data.token)
      store.setSetting('marketplace_user', JSON.stringify(data.data.user))
    }
    return data.data
  })

  register('market:setup', async (username, password, displayName) => {
    const serverUrl = (store.getSetting('marketplace_server_url') || 'http://localhost:3400').replace(/\/+$/, '')
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    let resp: Response
    try {
      resp = await fetch(`${serverUrl}/api/auth/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, displayName }),
        signal: controller.signal
      })
    } catch (err) {
      clearTimeout(timeoutId)
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('aborted') || msg.includes('AbortError')) {
        throw new Error(`初始化超时（5s）：无法连接 ${serverUrl}`)
      }
      throw new Error(`无法连接服务器 ${serverUrl}: ${msg}`)
    }
    clearTimeout(timeoutId)
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      throw new Error(
        (err as { error?: { message?: string } }).error?.message || `HTTP ${resp.status}`
      )
    }
    const data = (await resp.json()) as {
      data?: {
        token?: string
        user?: { id: string; username: string; displayName: string; role: string }
      }
    }
    if (data.data?.token) {
      store.setSetting('marketplace_jwt', data.data.token)
      store.setSetting('marketplace_user', JSON.stringify(data.data.user))
    }
    return data.data
  })

  register('market:testConnection', async (url?) => {
    const serverUrl = ((url as string | undefined) || store.getSetting('marketplace_server_url') || 'http://localhost:3400').replace(/\/+$/, '')
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    try {
      const resp = await fetch(`${serverUrl}/api/health`, { signal: controller.signal })
      clearTimeout(timeoutId)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      return (await resp.json()) as { status: string; needsSetup: boolean; timestamp: string }
    } catch (err) {
      clearTimeout(timeoutId)
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('aborted') || msg.includes('AbortError')) {
        throw new Error(`连接超时（5s）：${serverUrl}`)
      }
      throw new Error(`无法连接 ${serverUrl}: ${msg}`)
    }
  })
}

// @vitest-environment jsdom/**/**/**/**
/**
 * @file 双传输层测试
 * @description 验证渲染进程传输层的 IPC 优先 / HTTP 降级策略，
 *              包括自动切换、强制模式、健康检查、传输状态管理等场景。
 * @module tests/renderer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
// 测试中使用的 electronAPI 桩类型（preload 声明的 window.electronAPI 结构）
type TestElectronAPI = NonNullable<Window['electronAPI']>

// describe: 双传输层通信测试
describe('transport', () => {
  let call: (typeof import('../../src/renderer/src/transport'))['call']
  let checkHTTPHealth: (typeof import('../../src/renderer/src/transport'))['checkHTTPHealth']
  let checkIPCHealth: (typeof import('../../src/renderer/src/transport'))['checkIPCHealth']
  let setActiveTransport: (typeof import('../../src/renderer/src/transport'))['setActiveTransport']
  let getActiveTransport: (typeof import('../../src/renderer/src/transport'))['getActiveTransport']

  // 每个测试前重置模块、清理 localStorage，重新导入 transport 模块
  beforeEach(async () => {
    vi.resetModules()
    localStorage.clear()
    ;(window as unknown as { electronAPI?: TestElectronAPI }).electronAPI = undefined
    const mod = await import('../../src/renderer/src/transport')
    call = mod.call
    checkHTTPHealth = mod.checkHTTPHealth
    checkIPCHealth = mod.checkIPCHealth
    setActiveTransport = mod.setActiveTransport
    getActiveTransport = mod.getActiveTransport
  })

  // describe: IPC 调用成功场景
  describe('callIPC success', () => {
    it('returns data and sets activeTransport to ipc', async () => {
      // 用例：IPC 调用成功时返回数据并将传输层设为 ipc
      ;(window as unknown as { electronAPI?: TestElectronAPI }).electronAPI = {
        invoke: vi.fn().mockResolvedValue({ data: 'test' }),
        on: vi.fn()
      }
      const result = await call<string>('test:channel')
      expect(result).toBe('test')
      expect(getActiveTransport()).toBe('ipc')
    })
  })

  // describe: IPC 失败 → HTTP 成功降级场景
  describe('callIPC fail → callHTTP success', () => {
    it('falls back to HTTP and sets activeTransport to http', async () => {
      // 用例：IPC 不可用时自动降级到 HTTP 并将传输层设为 http
      ;(window as unknown as { electronAPI?: TestElectronAPI }).electronAPI = undefined
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: 'test' })
      })
      vi.stubGlobal('fetch', mockFetch)
      const result = await call<string>('test:channel')
      expect(result).toBe('test')
      expect(getActiveTransport()).toBe('http')
      vi.unstubAllGlobals()
    })
  })

  // describe: IPC 业务错误不应触发 HTTP 降级
  describe('IPC business error → no HTTP fallback', () => {
    it('throws the handler error without probing HTTP ports', async () => {
      // 用例：handler 正常返回 {error} 属于业务错误，直接抛出，不能再走 HTTP 重试
      const invoke = vi
        .fn()
        .mockResolvedValue({ error: { message: 'Task not found', code: 'NOT_FOUND' } })
      ;(window as unknown as { electronAPI?: TestElectronAPI }).electronAPI = {
        invoke,
        on: vi.fn()
      }
      const mockFetch = vi.fn()
      vi.stubGlobal('fetch', mockFetch)
      await expect(call('task:get')).rejects.toThrow('Task not found')
      expect(mockFetch).not.toHaveBeenCalled()
      vi.unstubAllGlobals()
    })
  })

  // describe: 强制 HTTP 模式场景
  describe('forced HTTP mode', () => {
    it('uses HTTP when localStorage has transport=http', async () => {
      // 用例：localStorage 设置 transport=http 时强制使用 HTTP
      localStorage.setItem('app-transport', 'http')
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: 'http-data' })
      })
      vi.stubGlobal('fetch', mockFetch)
      ;(window as unknown as { electronAPI?: TestElectronAPI }).electronAPI = {
        invoke: vi.fn().mockResolvedValue({ data: 'ipc-data' }),
        on: vi.fn()
      }
      const result = await call<string>('test:channel')
      expect(result).toBe('http-data')
      expect(getActiveTransport()).toBe('http')
      expect(
        (window as unknown as { electronAPI: TestElectronAPI }).electronAPI.invoke
      ).not.toHaveBeenCalled()
      vi.unstubAllGlobals()
    })
  })

  // describe: 强制 IPC 模式场景
  describe('forced IPC mode', () => {
    it('uses IPC when localStorage has transport=ipc', async () => {
      // 用例：localStorage 设置 transport=ipc 时强制使用 IPC
      localStorage.setItem('app-transport', 'ipc')
      ;(window as unknown as { electronAPI?: TestElectronAPI }).electronAPI = {
        invoke: vi.fn().mockResolvedValue({ data: 'ipc-data' }),
        on: vi.fn()
      }
      const result = await call<string>('test:channel')
      expect(result).toBe('ipc-data')
      expect(getActiveTransport()).toBe('ipc')
    })
  })

  // describe: 双通道均失败场景
  describe('both channels fail', () => {
    it('throws the IPC error', async () => {
      // 用例：IPC 和 HTTP 都失败时抛出 IPC 错误
      ;(window as unknown as { electronAPI?: TestElectronAPI }).electronAPI = {
        invoke: vi.fn().mockRejectedValue(new Error('IPC error')),
        on: vi.fn()
      }
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { message: 'Unauthorized' } })
      })
      vi.stubGlobal('fetch', mockFetch)
      await expect(call('test:channel')).rejects.toThrow('IPC error')
      vi.unstubAllGlobals()
    })
  })

  // describe: HTTP 健康检查函数
  describe('checkHTTPHealth', () => {
    it('returns true when /api/health responds ok', async () => {
      // 用例：/api/health 返回 ok 时 checkHTTPHealth 返回 true
      const mockFetch = vi.fn().mockResolvedValue({ ok: true })
      vi.stubGlobal('fetch', mockFetch)
      expect(await checkHTTPHealth()).toBe(true)
      vi.unstubAllGlobals()
    })

    it('returns false when /api/health responds not ok', async () => {
      // 用例：/api/health 返回非 ok 时 checkHTTPHealth 返回 false
      const mockFetch = vi.fn().mockResolvedValue({ ok: false })
      vi.stubGlobal('fetch', mockFetch)
      expect(await checkHTTPHealth()).toBe(false)
      vi.unstubAllGlobals()
    })

    it('returns false when fetch throws', async () => {
      // 用例：fetch 抛出异常时 checkHTTPHealth 返回 false
      const mockFetch = vi.fn().mockRejectedValue(new Error('network error'))
      vi.stubGlobal('fetch', mockFetch)
      expect(await checkHTTPHealth()).toBe(false)
      vi.unstubAllGlobals()
    })
  })

  // describe: IPC 健康检查函数
  describe('checkIPCHealth', () => {
    it('returns true when electronAPI is available', () => {
      // 用例：electronAPI 可用时 checkIPCHealth 返回 true
      ;(window as unknown as { electronAPI?: TestElectronAPI }).electronAPI = { invoke: vi.fn(),
        on: vi.fn() }
      expect(checkIPCHealth()).toBe(true)
    })

    it('returns false when electronAPI is not available', () => {
      // 用例：electronAPI 不可用时 checkIPCHealth 返回 false
      ;(window as unknown as { electronAPI?: TestElectronAPI }).electronAPI = undefined
      expect(checkIPCHealth()).toBe(false)
    })
  })

  // describe: 传输层状态管理函数
  describe('setActiveTransport / getActiveTransport', () => {
    it('sets and gets active transport', () => {
      // 用例：setActiveTransport 设置后 getActiveTransport 返回对应值
      setActiveTransport('http')
      expect(getActiveTransport()).toBe('http')
      setActiveTransport('ipc')
      expect(getActiveTransport()).toBe('ipc')
    })

    it('persists to localStorage', () => {
      // 用例：setActiveTransport 将状态持久化到 localStorage
      setActiveTransport('http')
      expect(localStorage.getItem('app-transport')).toBe('http')
    })
  })
})

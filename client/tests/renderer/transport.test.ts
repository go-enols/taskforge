// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('transport', () => {
  let call: (typeof import('../../src/renderer/src/transport'))['call']
  let checkHTTPHealth: (typeof import('../../src/renderer/src/transport'))['checkHTTPHealth']
  let checkIPCHealth: (typeof import('../../src/renderer/src/transport'))['checkIPCHealth']
  let setActiveTransport: (typeof import('../../src/renderer/src/transport'))['setActiveTransport']
  let getActiveTransport: (typeof import('../../src/renderer/src/transport'))['getActiveTransport']

  beforeEach(async () => {
    vi.resetModules()
    localStorage.clear()
    ;(window as unknown as { electronAPI?: ElectronAPI }).electronAPI = undefined
    const mod = await import('../../src/renderer/src/transport')
    call = mod.call
    checkHTTPHealth = mod.checkHTTPHealth
    checkIPCHealth = mod.checkIPCHealth
    setActiveTransport = mod.setActiveTransport
    getActiveTransport = mod.getActiveTransport
  })

  describe('callIPC success', () => {
    it('returns data and sets activeTransport to ipc', async () => {
      ;(window as unknown as { electronAPI?: ElectronAPI }).electronAPI = {
        invoke: vi.fn().mockResolvedValue({ data: 'test' })
      }
      const result = await call<string>('test:channel')
      expect(result).toBe('test')
      expect(getActiveTransport()).toBe('ipc')
    })
  })

  describe('callIPC fail → callHTTP success', () => {
    it('falls back to HTTP and sets activeTransport to http', async () => {
      ;(window as unknown as { electronAPI?: ElectronAPI }).electronAPI = undefined
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

  describe('forced HTTP mode', () => {
    it('uses HTTP when localStorage has transport=http', async () => {
      localStorage.setItem('app-transport', 'http')
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: 'http-data' })
      })
      vi.stubGlobal('fetch', mockFetch)
      ;(window as unknown as { electronAPI?: ElectronAPI }).electronAPI = {
        invoke: vi.fn().mockResolvedValue({ data: 'ipc-data' })
      }
      const result = await call<string>('test:channel')
      expect(result).toBe('http-data')
      expect(getActiveTransport()).toBe('http')
      expect(
        (window as unknown as { electronAPI?: ElectronAPI }).electronAPI.invoke
      ).not.toHaveBeenCalled()
      vi.unstubAllGlobals()
    })
  })

  describe('forced IPC mode', () => {
    it('uses IPC when localStorage has transport=ipc', async () => {
      localStorage.setItem('app-transport', 'ipc')
      ;(window as unknown as { electronAPI?: ElectronAPI }).electronAPI = {
        invoke: vi.fn().mockResolvedValue({ data: 'ipc-data' })
      }
      const result = await call<string>('test:channel')
      expect(result).toBe('ipc-data')
      expect(getActiveTransport()).toBe('ipc')
    })
  })

  describe('both channels fail', () => {
    it('throws the IPC error', async () => {
      ;(window as unknown as { electronAPI?: ElectronAPI }).electronAPI = {
        invoke: vi.fn().mockRejectedValue(new Error('IPC error'))
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

  describe('checkHTTPHealth', () => {
    it('returns true when /api/health responds ok', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true })
      vi.stubGlobal('fetch', mockFetch)
      expect(await checkHTTPHealth()).toBe(true)
      vi.unstubAllGlobals()
    })

    it('returns false when /api/health responds not ok', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: false })
      vi.stubGlobal('fetch', mockFetch)
      expect(await checkHTTPHealth()).toBe(false)
      vi.unstubAllGlobals()
    })

    it('returns false when fetch throws', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('network error'))
      vi.stubGlobal('fetch', mockFetch)
      expect(await checkHTTPHealth()).toBe(false)
      vi.unstubAllGlobals()
    })
  })

  describe('checkIPCHealth', () => {
    it('returns true when electronAPI is available', () => {
      ;(window as unknown as { electronAPI?: ElectronAPI }).electronAPI = { invoke: vi.fn() }
      expect(checkIPCHealth()).toBe(true)
    })

    it('returns false when electronAPI is not available', () => {
      ;(window as unknown as { electronAPI?: ElectronAPI }).electronAPI = undefined
      expect(checkIPCHealth()).toBe(false)
    })
  })

  describe('setActiveTransport / getActiveTransport', () => {
    it('sets and gets active transport', () => {
      setActiveTransport('http')
      expect(getActiveTransport()).toBe('http')
      setActiveTransport('ipc')
      expect(getActiveTransport()).toBe('ipc')
    })

    it('persists to localStorage', () => {
      setActiveTransport('http')
      expect(localStorage.getItem('app-transport')).toBe('http')
    })
  })
})

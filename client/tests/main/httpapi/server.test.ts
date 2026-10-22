/**
 * @file HTTP API 服务端测试
 * @description 验证 HttpApiServer 的启动、健康检查、API 调用、
 *              认证验证、错误处理等核心功能。
 * @module tests/main/httpapi
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { StoreService } from '../../../src/main/services/store'
import { TaskService } from '../../../src/main/services/task'
import { registerIpcHandlers, handlerMap } from '../../../src/main/ipc'
import { HttpApiServer } from '../../../src/main/httpapi/server'

/** 模拟 Electron 模块，避免真实环境依赖 */
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: {
    getVersion: () => '0.0.1',
    getPath: () => '/tmp',
    getAppPath: () => process.cwd()
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (plaintext: string) => Buffer.from(plaintext),
    decryptString: (cipher: Buffer) => cipher.toString()
  }
}))

// describe: HttpApiServer HTTP API 服务端测试
describe('HttpApiServer', () => {
  let store: StoreService
  let server: HttpApiServer
  let baseUrl: string
  const testToken = 'test-auth-token'

  // 每个测试前启动 HTTP 服务并注册 handler
  beforeEach(async () => {
    handlerMap.clear()
    const dbPath = join(tmpdir(), `test-httpapi-${randomUUID()}.db`)
    store = new StoreService(dbPath)
    const taskService = new TaskService(store)
    registerIpcHandlers({
      store,
      taskService,
      scriptFetcher: null as unknown as import('../../../src/main/services/script-fetcher').ScriptFetcher,
      walletRepo: store.walletRepo,
      proxyRepo: store.proxyRepo,
      taskRepo: store.taskRepo
    })

    server = new HttpApiServer(0, testToken)
    await server.start()
    baseUrl = server.getAddress()
  })

  // 每个测试后停止 HTTP 服务并关闭数据库
  afterEach(async () => {
    await server.stop()
    store.close()
  })

  it('GET /api/health returns ok', async () => {
    // 用例：健康检查端点返回 ok 状态
    const res = await fetch(`${baseUrl}/api/health`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.timestamp).toBeDefined()
  })

  it('POST /api/call wallet:list returns paginated data', async () => {
    // 用例：通过 POST /api/call 调用 wallet:list 返回分页数据
    const res = await fetch(`${baseUrl}/api/call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testToken}`
      },
      body: JSON.stringify({ channel: 'wallet:list', args: [] })
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toBeDefined()
    expect(body.data.items).toEqual([])
    expect(body.data.total).toBe(0)
    expect(body.data.page).toBe(1)
  })

  it('POST /api/call wallet:create creates a wallet', async () => {
    // 用例：通过 POST /api/call 调用 wallet:create 创建钱包
    const res = await fetch(`${baseUrl}/api/call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testToken}`
      },
      body: JSON.stringify({
        channel: 'wallet:create',
        args: [
          {
            address: '0x1234567890abcdef1234567890abcdef12345678',
            privateKey: null,
            mnemonic: null,
            walletType: 'evm',
            labels: []
          }
        ]
      })
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toBeDefined()
    expect(body.data.address).toBe('0x1234567890abcdef1234567890abcdef12345678')
    expect(body.data.walletType).toBe('evm')
    expect(body.data.id).toBeDefined()
  })

  it('POST /api/call setting:set and setting:get', async () => {
    // 用例：通过 POST /api/call 设置和获取设置值
    const setRes = await fetch(`${baseUrl}/api/call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testToken}`
      },
      body: JSON.stringify({ channel: 'setting:set', args: ['testKey', 'testValue'] })
    })
    expect(setRes.status).toBe(200)
    const setBody = await setRes.json()
    expect(setBody.data).toBeUndefined()

    const getRes = await fetch(`${baseUrl}/api/call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testToken}`
      },
      body: JSON.stringify({ channel: 'setting:get', args: ['testKey'] })
    })
    expect(getRes.status).toBe(200)
    const getBody = await getRes.json()
    expect(getBody.data).toBe('testValue')
  })

  it('POST /api/call unknown channel returns NOT_FOUND', async () => {
    // 用例：调用未知 channel 返回 NOT_FOUND 错误
    const res = await fetch(`${baseUrl}/api/call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testToken}`
      },
      body: JSON.stringify({ channel: 'unknown:channel', args: [] })
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.error).toBeDefined()
    expect(body.error.message).toBe('Unknown channel: unknown:channel')
    expect(body.error.code).toBe('NOT_FOUND')
  })

  it('POST /api/call missing channel returns 400', async () => {
    // 用例：缺少 channel 参数时返回 400 错误
    const res = await fetch(`${baseUrl}/api/call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testToken}`
      },
      body: JSON.stringify({ args: [] })
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.message).toBe('Missing or invalid channel')
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('OPTIONS request returns 204', async () => {
    // 用例：OPTIONS 预检请求返回 204
    const res = await fetch(`${baseUrl}/api/call`, {
      method: 'OPTIONS'
    })
    expect(res.status).toBe(204)
  })

  it('unknown path returns 404', async () => {
    // 用例：访问未知路径返回 404
    const res = await fetch(`${baseUrl}/api/unknown`, {
      headers: {
        Authorization: `Bearer ${testToken}`
      }
    })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.message).toBe('Not found')
    expect(body.error.code).toBe('NOT_FOUND')
  })
})

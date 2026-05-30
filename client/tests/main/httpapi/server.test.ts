import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { StoreService } from '../../../src/main/services/store'
import { WalletService } from '../../../src/main/services/wallet'
import { TaskService } from '../../../src/main/services/task'
import { registerIpcHandlers, handlerMap } from '../../../src/main/ipc'
import { HttpApiServer } from '../../../src/main/httpapi/server'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getVersion: () => '0.0.1', getPath: () => '/tmp' }
}))

describe('HttpApiServer', () => {
  let store: StoreService
  let server: HttpApiServer
  let baseUrl: string
  const testToken = 'test-auth-token'

  beforeEach(async () => {
    handlerMap.clear()
    const dbPath = join(tmpdir(), `test-httpapi-${randomUUID()}.db`)
    store = new StoreService(dbPath)
    const walletService = new WalletService(store)
    const taskService = new TaskService(store)
    registerIpcHandlers({
      store,
      walletService,
      taskService,
      scriptFetcher: null as any,
      walletRepo: store.walletRepo,
      proxyRepo: store.proxyRepo,
      taskRepo: store.taskRepo
    })

    server = new HttpApiServer(0, testToken)
    await server.start()
    baseUrl = server.getAddress()
  })

  afterEach(async () => {
    await server.stop()
    store.close()
  })

  it('GET /api/health returns ok', async () => {
    const res = await fetch(`${baseUrl}/api/health`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.timestamp).toBeDefined()
  })

  it('POST /api/call wallet:list returns paginated data', async () => {
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
    const res = await fetch(`${baseUrl}/api/call`, {
      method: 'OPTIONS'
    })
    expect(res.status).toBe(204)
  })

  it('unknown path returns 404', async () => {
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

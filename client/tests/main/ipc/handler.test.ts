import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { executeHandler, handlerMap, registerIpcHandlers } from '../../../src/main/ipc'
import { StoreService } from '../../../src/main/services/store'
import { WalletService } from '../../../src/main/services/wallet'
import { TaskService } from '../../../src/main/services/task'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdtempSync, rmSync } from 'fs'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getVersion: () => '0.0.1', getPath: () => '/tmp' }
}))

describe('IPC Handler Integration', () => {
  let store: StoreService
  let walletService: WalletService
  let taskService: TaskService
  let tmpDir: string

  beforeEach(() => {
    handlerMap.clear()
    tmpDir = mkdtempSync(join(tmpdir(), 'ipc-test-'))
    const dbPath = join(tmpDir, 'test.db')
    store = new StoreService(dbPath)
    walletService = new WalletService(store)
    taskService = new TaskService(store)
    registerIpcHandlers({
      store,
      walletService,
      taskService,
      scriptFetcher: null as any,
      walletRepo: store.walletRepo,
      proxyRepo: store.proxyRepo,
      taskRepo: store.taskRepo
    })
  })

  afterEach(() => {
    store.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('handlerMap has registered handlers after registerIpcHandlers', () => {
    expect(handlerMap.size).toBeGreaterThan(0)
  })

  it('wallet:list returns empty list', async () => {
    const result = await executeHandler('wallet:list', [])
    expect(result.data).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 1
    })
  })

  it('wallet:create + wallet:get creates and retrieves a wallet', async () => {
    const createResult = await executeHandler('wallet:create', [
      {
        address: '0x1234567890abcdef',
        privateKey: '0xpk',
        mnemonic: null,
        walletType: 'evm',
        labels: ['test']
      }
    ])
    expect(createResult.error).toBeUndefined()
    const created = createResult.data as { id: string }
    expect(created.id).toBeDefined()

    const getResult = await executeHandler('wallet:get', [created.id])
    expect(getResult.error).toBeUndefined()
    expect((getResult.data as { address: string }).address).toBe('0x1234567890abcdef')
  })

  it('wallet:delete removes the wallet', async () => {
    const createResult = await executeHandler('wallet:create', [
      {
        address: '0xabc',
        privateKey: null,
        mnemonic: null,
        walletType: 'evm',
        labels: []
      }
    ])
    const id = (createResult.data as { id: string }).id

    await executeHandler('wallet:delete', [id])

    const getResult = await executeHandler('wallet:get', [id])
    expect(getResult.data).toBeNull()
  })

  it('app:getInfo returns version and dbConnected', async () => {
    const result = await executeHandler('app:getInfo', [])
    expect(result.error).toBeUndefined()
    const info = result.data as { version: string; dbConnected: boolean }
    expect(info.version).toBe('0.0.1')
    expect(info.dbConnected).toBe(true)
  })

  it('setting:set + setting:get sets and retrieves a value', async () => {
    await executeHandler('setting:set', ['testKey', 'testValue'])
    const result = await executeHandler('setting:get', ['testKey'])
    expect(result.data).toBe('testValue')
  })

  it('executeHandler returns error for unknown channel', async () => {
    const result = await executeHandler('unknown:channel', [])
    expect(result.error).toEqual({
      message: 'Unknown channel: unknown:channel',
      code: 'NOT_FOUND'
    })
  })

  it('executeHandler returns error when handler throws', async () => {
    const result = await executeHandler('task:start', ['nonexistent-id'])
    expect(result.error).toBeDefined()
    expect(result.error?.code).toBe('UNKNOWN')
  })
})

/**
 * @file IPC Handler 集成测试
 * @description 验证 IPC handler 注册表（handlerMap）和 executeHandler 函数，
 *              确保钱包、任务、设置等各业务模块的 IPC 通道正确注册并能正常响应。
 * @module tests/main/ipc
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { executeHandler, handlerMap, registerIpcHandlers } from '../../../src/main/ipc'
import { StoreService } from '../../../src/main/services/store'
import { TaskService } from '../../../src/main/services/task'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdtempSync, rmSync } from 'fs'

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

// describe: IPC Handler 集成测试
describe('IPC Handler Integration', () => {
  let store: StoreService
  let taskService: TaskService
  let tmpDir: string

  // 每个测试前重置 handlerMap 并重新注册所有 handler
  beforeEach(() => {
    handlerMap.clear()
    tmpDir = mkdtempSync(join(tmpdir(), 'ipc-test-'))
    const dbPath = join(tmpDir, 'test.db')
    store = new StoreService(dbPath)
    taskService = new TaskService(store)
    registerIpcHandlers({
      store,
      taskService,
      scriptFetcher: null as unknown as import('../../../src/main/services/script-fetcher').ScriptFetcher,
      walletRepo: store.walletRepo,
      proxyRepo: store.proxyRepo,
      taskRepo: store.taskRepo
    })
  })

  // 每个测试后关闭数据库并清理临时目录
  afterEach(() => {
    store.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('handlerMap has registered handlers after registerIpcHandlers', () => {
    // 用例：registerIpcHandlers 后 handlerMap 中存在已注册的处理器
    expect(handlerMap.size).toBeGreaterThan(0)
  })

  it('wallet:list returns empty list', async () => {
    // 用例：wallet:list 返回空列表
    const result = await executeHandler('wallet:list', [])
    expect(result.data).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 1
    })
  })

  it('wallet:list redacts privateKey/mnemonic (keys stay in main process)', async () => {
    // 用例：列表接口脱敏，私钥/助记词不应进入渲染进程
    await executeHandler('wallet:create', [
      {
        address: '0xredacted',
        privateKey: '0xsecret',
        mnemonic: 'word1 word2',
        walletType: 'evm',
        labels: []
      }
    ])
    const listResult = await executeHandler('wallet:list', [])
    const items = (listResult.data as { items: Array<Record<string, unknown>> }).items
    expect(items).toHaveLength(1)
    expect(items[0].address).toBe('0xredacted')
    expect(items[0].privateKey).toBeNull()
    expect(items[0].mnemonic).toBeNull()

    // wallet:get 仍返回完整数据，供导出/签名等明确动作使用
    const getResult = await executeHandler('wallet:get', [items[0].id])
    expect((getResult.data as Record<string, unknown>).privateKey).toBe('0xsecret')
  })

  it('wallet:create + wallet:get creates and retrieves a wallet', async () => {
    // 用例：wallet:create 创建钱包后 wallet:get 能正确获取
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
    // 用例：wallet:delete 删除已创建的钱包
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
    // 用例：app:getInfo 返回版本号和数据库连接状态
    const result = await executeHandler('app:getInfo', [])
    expect(result.error).toBeUndefined()
    const info = result.data as { version: string; dbConnected: boolean }
    expect(info.version).toBe('0.0.1')
    expect(info.dbConnected).toBe(true)
  })

  it('setting:set + setting:get sets and retrieves a value', async () => {
    // 用例：setting:set 设置后 setting:get 能正确获取
    await executeHandler('setting:set', ['testKey', 'testValue'])
    const result = await executeHandler('setting:get', ['testKey'])
    expect(result.data).toBe('testValue')
  })

  it('executeHandler returns error for unknown channel', async () => {
    // 用例：未知 channel 返回错误信息
    const result = await executeHandler('unknown:channel', [])
    expect(result.error).toEqual({
      message: 'Unknown channel: unknown:channel',
      code: 'NOT_FOUND'
    })
  })

  it('executeHandler returns error when handler throws', async () => {
    // 用例：handler 内部抛出异常时返回错误信息
    const result = await executeHandler('task:start', ['nonexistent-id'])
    expect(result.error).toBeDefined()
    expect(result.error?.code).toBe('UNKNOWN')
  })
})

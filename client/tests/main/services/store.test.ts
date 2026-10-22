/**
 * @file 数据存储服务测试
 * @description 验证 StoreService / 各 Repository 的 CRUD、分页、搜索、统计与设置能力。
 *              覆盖：钱包、脚本参数（原 accounts）、代理、任务与任务日志、设置、
 *              统计聚合、应用日志、空投项目。
 * @module tests/main/services
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { StoreService } from '../../../src/main/services/store'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { rmSync } from 'fs'
import type { TaskTemplate } from '../../../src/shared/types'

/** 全局 StoreService 实例 */
let store: StoreService
/** 当前测试的临时数据库路径 */
let dbPath: string

/** 创建临时数据库文件路径 */
function createTempDbPath(): string {
  return join(tmpdir(), `test-store-${randomUUID()}.db`)
}

/** 每个测试前创建新的临时数据库实例 */
beforeEach(() => {
  dbPath = createTempDbPath()
  store = new StoreService(dbPath)
})

/** 每个测试后关闭数据库并清理文件（含 WAL/SHM） */
afterEach(() => {
  store.close()
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(dbPath + suffix, { force: true })
  }
})

/** 钱包创建入参 */
type WalletInput = Parameters<StoreService['walletRepo']['createWallet']>[0]
/** 脚本参数创建入参 */
type ScriptParamInput = Parameters<StoreService['createScriptParam']>[0]
/** 代理创建入参 */
type ProxyInput = Parameters<StoreService['proxyRepo']['createProxy']>[0]
/** 任务创建入参 */
type TaskInput = Parameters<StoreService['taskRepo']['createTask']>[0]
/** 空投创建入参 */
type AirdropInput = Parameters<StoreService['createAirdrop']>[0]

/** 构造钱包入参 */
function walletInput(overrides: Partial<WalletInput> = {}): WalletInput {
  return {
    address: '0xabc123',
    privateKey: null,
    mnemonic: null,
    walletType: 'evm',
    labels: [],
    ...overrides
  }
}

/** 构造脚本参数入参 */
function scriptParamInput(overrides: Partial<ScriptParamInput> = {}): ScriptParamInput {
  return {
    templateId: 'tmpl-1',
    data: { key: 'value' },
    pool: 'pool-a',
    labels: [],
    notes: '',
    ...overrides
  }
}

/** 构造代理入参 */
function proxyInput(overrides: Partial<ProxyInput> = {}): ProxyInput {
  return {
    protocol: 'http',
    host: '127.0.0.1',
    port: 8080,
    username: null,
    password: null,
    status: 'active',
    format: 'manual',
    labels: [],
    ...overrides
  }
}

/** 构造任务入参 */
function taskInput(overrides: Partial<TaskInput> = {}): TaskInput {
  return {
    scriptFolder: '/scripts/demo',
    config: {},
    status: 'idle',
    workerId: null,
    startedAt: null,
    endedAt: null,
    isSandbox: false,
    ...overrides
  }
}

/** 构造空投项目入参 */
function airdropInput(overrides: Partial<AirdropInput> = {}): AirdropInput {
  return {
    name: 'LayerZero',
    chain: 'Ethereum',
    status: 'ongoing',
    projectType: 'testnet',
    description: 'Airdrop project',
    website: 'https://layerzero.network',
    accountPool: 'default',
    links: [{ label: 'Docs', url: 'https://example.com' }],
    eligibilityCriteria: [],
    tasks: [],
    earnings: [],
    tags: ['defi'],
    labels: ['hot'],
    ...overrides
  }
}

/** 构造任务脚本模板入参 */
function taskTemplateInput(overrides: Partial<Omit<TaskTemplate, 'id'>> = {}): Omit<
  TaskTemplate,
  'id'
> {
  return {
    name: 'Demo Script',
    version: '1.0.0',
    description: '',
    installPath: '/scripts/demo',
    manifest: {},
    remoteUrl: null,
    isInstalled: true,
    downloadedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  }
}

// describe: 钱包 CRUD 操作测试
describe('Wallet CRUD', () => {
  it('createWallet returns object with id, createdAt and correct fields', () => {
    const wallet = store.walletRepo.createWallet(
      walletInput({
        address: '0xabc123',
        privateKey: 'pk-1',
        mnemonic: 'word1 word2',
        labels: ['label1']
      })
    )
    expect(wallet.id).toBeDefined()
    expect(typeof wallet.id).toBe('string')
    expect(typeof wallet.createdAt).toBe('string')
    expect(wallet.address).toBe('0xabc123')
    // safeStorage 在测试环境不可用，EncryptionService 走明文降级
    expect(wallet.privateKey).toBe('pk-1')
    expect(wallet.mnemonic).toBe('word1 word2')
    expect(wallet.walletType).toBe('evm')
    expect(wallet.labels).toEqual(['label1'])
  })

  it('getWallet returns correct data when exists', () => {
    const created = store.walletRepo.createWallet(
      walletInput({ address: '0xdef456', walletType: 'solana' })
    )
    const fetched = store.walletRepo.getWallet(created.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.id).toBe(created.id)
    expect(fetched!.address).toBe('0xdef456')
    expect(fetched!.walletType).toBe('solana')
  })

  it('getWallet returns null when not exists', () => {
    expect(store.walletRepo.getWallet('non-existent-id')).toBeNull()
  })

  it('listWallets returns empty list', () => {
    const result = store.walletRepo.listWallets()
    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
    expect(result.page).toBe(1)
  })

  it('listWallets pagination works correctly', () => {
    for (let i = 0; i < 5; i++) {
      store.walletRepo.createWallet(walletInput({ address: `0x${i}` }))
    }
    const page1 = store.walletRepo.listWallets(1, 2)
    expect(page1.items.length).toBe(2)
    expect(page1.total).toBe(5)
    expect(page1.totalPages).toBe(3)

    const page3 = store.walletRepo.listWallets(3, 2)
    expect(page3.items.length).toBe(1)
    expect(page3.page).toBe(3)
  })

  it('listWallets search works correctly', () => {
    store.walletRepo.createWallet(walletInput({ address: '0xsearchable' }))
    store.walletRepo.createWallet(walletInput({ address: '0xother', walletType: 'solana' }))
    const result = store.walletRepo.listWallets(1, 20, 'searchable')
    expect(result.items.length).toBe(1)
    expect(result.items[0].address).toBe('0xsearchable')
  })

  it('updateWallet updates fields correctly', () => {
    const created = store.walletRepo.createWallet(walletInput({ address: '0xbefore' }))
    const updated = store.walletRepo.updateWallet(created.id, {
      address: '0xafter',
      walletType: 'solana',
      labels: ['updated']
    })
    expect(updated).not.toBeNull()
    expect(updated!.address).toBe('0xafter')
    expect(updated!.walletType).toBe('solana')
    expect(updated!.labels).toEqual(['updated'])
  })

  it('updateWallet returns null when not exists', () => {
    expect(store.walletRepo.updateWallet('non-existent', { address: '0xnope' })).toBeNull()
  })

  it('deleteWallet returns true on success', () => {
    const created = store.walletRepo.createWallet(walletInput({ address: '0xtodelete' }))
    expect(store.walletRepo.deleteWallet(created.id)).toBe(true)
    expect(store.walletRepo.getWallet(created.id)).toBeNull()
  })

  it('deleteWallet returns false when not exists', () => {
    expect(store.walletRepo.deleteWallet('non-existent')).toBe(false)
  })

  it('batchCreateWallets creates correct count', () => {
    const count = store.walletRepo.batchCreateWallets([
      walletInput({ address: '0xb1' }),
      walletInput({ address: '0xb2' }),
      walletInput({ address: '0xb3', walletType: 'solana', labels: ['batch'] })
    ])
    expect(count).toBe(3)
    expect(store.walletRepo.listWallets().total).toBe(3)
  })

  it('batchDeleteWallets deletes correct count', () => {
    const w1 = store.walletRepo.createWallet(walletInput({ address: '0xbd1' }))
    const w2 = store.walletRepo.createWallet(walletInput({ address: '0xbd2' }))
    store.walletRepo.createWallet(walletInput({ address: '0xbd3' }))
    expect(store.walletRepo.batchDeleteWallets([w1.id, w2.id, 'non-existent'])).toBe(2)
    expect(store.walletRepo.listWallets().total).toBe(1)
  })
})

// describe: 脚本参数 CRUD 操作测试（原 accounts 表，重构后更名）
describe('ScriptParam CRUD', () => {
  it('createScriptParam and getScriptParam work correctly', () => {
    const param = store.createScriptParam(
      scriptParamInput({
        templateId: 'tmpl-1',
        data: { key: 'value' },
        pool: 'pool-a',
        labels: ['acct'],
        notes: 'test note'
      })
    )
    expect(param.id).toBeDefined()
    expect(param.createdAt).toBeDefined()
    expect(param.updatedAt).toBeDefined()
    expect(param.templateId).toBe('tmpl-1')
    expect(param.data).toEqual({ key: 'value' })
    expect(param.pool).toBe('pool-a')
    expect(param.labels).toEqual(['acct'])
    expect(param.notes).toBe('test note')

    const fetched = store.getScriptParam(param.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.id).toBe(param.id)
  })

  it('getScriptParam returns null when not exists', () => {
    expect(store.getScriptParam('non-existent')).toBeNull()
  })

  it('listScriptParams returns paginated results', () => {
    for (let i = 0; i < 3; i++) {
      store.createScriptParam(
        scriptParamInput({ templateId: `tmpl-${i}`, pool: `pool-${i}`, data: {} })
      )
    }
    const result = store.listScriptParams(1, 2)
    expect(result.items.length).toBe(2)
    expect(result.total).toBe(3)
  })

  it('listScriptParams search works', () => {
    store.createScriptParam(scriptParamInput({ pool: 'special-pool' }))
    store.createScriptParam(scriptParamInput({ pool: 'other', notes: '' }))
    const result = store.listScriptParams(1, 20, 'special')
    expect(result.items.length).toBe(1)
  })

  it('listScriptParamPools returns distinct pools', () => {
    store.createScriptParam(scriptParamInput({ pool: 'pool-a' }))
    store.createScriptParam(scriptParamInput({ pool: 'pool-b' }))
    store.createScriptParam(scriptParamInput({ pool: 'pool-a' }))
    const pools = store.listScriptParamPools()
    expect(pools.sort()).toEqual(['pool-a', 'pool-b'])
  })

  it('updateScriptParam updates fields correctly', () => {
    const created = store.createScriptParam(
      scriptParamInput({ pool: 'old-pool', notes: 'old' })
    )
    const updated = store.updateScriptParam(created.id, { pool: 'new-pool', notes: 'new' })
    expect(updated).not.toBeNull()
    expect(updated!.pool).toBe('new-pool')
    expect(updated!.notes).toBe('new')
    expect(typeof updated!.updatedAt).toBe('string')
  })

  it('deleteScriptParam returns true on success', () => {
    const created = store.createScriptParam(scriptParamInput())
    expect(store.deleteScriptParam(created.id)).toBe(true)
    expect(store.getScriptParam(created.id)).toBeNull()
  })

  it('deleteScriptParam returns false when not exists', () => {
    expect(store.deleteScriptParam('non-existent')).toBe(false)
  })
})

// describe: 代理 CRUD 操作测试
describe('Proxy CRUD', () => {
  it('createProxy and getProxy work correctly', () => {
    const proxy = store.proxyRepo.createProxy(
      proxyInput({
        host: '127.0.0.1',
        port: 8080,
        username: 'user',
        password: 'pass',
        labels: ['proxy1']
      })
    )
    expect(proxy.id).toBeDefined()
    expect(typeof proxy.createdAt).toBe('string')
    expect(proxy.protocol).toBe('http')
    expect(proxy.host).toBe('127.0.0.1')
    expect(proxy.port).toBe(8080)
    expect(proxy.username).toBe('user')
    expect(proxy.password).toBe('pass')
    expect(proxy.status).toBe('active')
    expect(proxy.format).toBe('manual')
    expect(proxy.labels).toEqual(['proxy1'])

    const fetched = store.proxyRepo.getProxy(proxy.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.id).toBe(proxy.id)
  })

  it('getProxy returns null when not exists', () => {
    expect(store.proxyRepo.getProxy('non-existent')).toBeNull()
  })

  it('listProxies returns paginated results', () => {
    for (let i = 0; i < 4; i++) {
      store.proxyRepo.createProxy(proxyInput({ host: `host${i}`, port: 8080 + i }))
    }
    const result = store.proxyRepo.listProxies(1, 2)
    expect(result.items.length).toBe(2)
    expect(result.total).toBe(4)
  })

  it('listProxies search works', () => {
    store.proxyRepo.createProxy(proxyInput({ protocol: 'socks5', host: 'target', port: 1080 }))
    store.proxyRepo.createProxy(proxyInput({ host: 'other', port: 8080 }))
    const result = store.proxyRepo.listProxies(1, 20, 'target')
    expect(result.items.length).toBe(1)
  })

  it('updateProxy updates fields correctly', () => {
    const created = store.proxyRepo.createProxy(proxyInput({ host: 'old-host' }))
    const updated = store.proxyRepo.updateProxy(created.id, {
      host: 'new-host',
      port: 9090,
      status: 'inactive'
    })
    expect(updated).not.toBeNull()
    expect(updated!.host).toBe('new-host')
    expect(updated!.port).toBe(9090)
    expect(updated!.status).toBe('inactive')
  })

  it('deleteProxy returns true on success', () => {
    const created = store.proxyRepo.createProxy(proxyInput({ host: 'del' }))
    expect(store.proxyRepo.deleteProxy(created.id)).toBe(true)
    expect(store.proxyRepo.getProxy(created.id)).toBeNull()
  })

  it('deleteProxy returns false when not exists', () => {
    expect(store.proxyRepo.deleteProxy('non-existent')).toBe(false)
  })
})

// describe: 任务 CRUD 与日志测试
describe('Task CRUD', () => {
  it('createTask and getTask work correctly', () => {
    const task = store.taskRepo.createTask(
      taskInput({ scriptFolder: '/scripts/task1', config: { param: 1 } })
    )
    expect(task.id).toBeDefined()
    expect(task.scriptFolder).toBe('/scripts/task1')
    expect(task.config).toEqual({ param: 1 })
    expect(task.status).toBe('idle')
    expect(task.workerId).toBeNull()
    expect(task.startedAt).toBeNull()
    expect(task.endedAt).toBeNull()
    expect(task.isSandbox).toBe(false)

    const fetched = store.taskRepo.getTask(task.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.id).toBe(task.id)
  })

  it('getTask returns null when not exists', () => {
    expect(store.taskRepo.getTask('non-existent')).toBeNull()
  })

  it('listTasks returns paginated results', () => {
    for (let i = 0; i < 3; i++) {
      store.taskRepo.createTask(taskInput({ scriptFolder: `/scripts/t${i}` }))
    }
    const result = store.taskRepo.listTasks(1, 2)
    expect(result.items.length).toBe(2)
    expect(result.total).toBe(3)
  })

  it('listTasks search works', () => {
    store.taskRepo.createTask(taskInput({ scriptFolder: '/scripts/special', status: 'running' }))
    store.taskRepo.createTask(taskInput({ scriptFolder: '/scripts/other' }))
    const result = store.taskRepo.listTasks(1, 20, 'special')
    expect(result.items.length).toBe(1)
  })

  it('updateTask updates fields correctly', () => {
    const created = store.taskRepo.createTask(taskInput({ scriptFolder: '/scripts/old' }))
    const updated = store.taskRepo.updateTask(created.id, {
      status: 'running',
      workerId: 'worker-1',
      isSandbox: true
    })
    expect(updated).not.toBeNull()
    expect(updated!.status).toBe('running')
    expect(updated!.workerId).toBe('worker-1')
    expect(updated!.isSandbox).toBe(true)
  })

  it('updateTask returns null when not exists', () => {
    expect(store.taskRepo.updateTask('non-existent', { status: 'running' })).toBeNull()
  })

  it('deleteTask returns true on success and removes its logs', () => {
    const created = store.taskRepo.createTask(taskInput({ scriptFolder: '/scripts/del' }))
    store.taskRepo.addTaskLog(created.id, 'info', 'will be deleted')
    expect(store.taskRepo.deleteTask(created.id)).toBe(true)
    expect(store.taskRepo.getTask(created.id)).toBeNull()
    expect(store.taskRepo.getTaskLogs(created.id)).toEqual([])
  })

  it('deleteTask returns false when not exists', () => {
    expect(store.taskRepo.deleteTask('non-existent')).toBe(false)
  })

  it('addTaskLog and getTaskLogs work correctly', () => {
    const task = store.taskRepo.createTask(taskInput({ scriptFolder: '/scripts/log' }))
    store.taskRepo.addTaskLog(task.id, 'info', 'started')
    store.taskRepo.addTaskLog(task.id, 'error', 'failed')

    const logs = store.taskRepo.getTaskLogs(task.id)
    expect(logs.length).toBe(2)
    expect(logs[0].level).toBe('error')
    expect(logs[0].message).toBe('failed')
    expect(logs[1].level).toBe('info')
    expect(logs[1].message).toBe('started')
    expect(logs[0].taskId).toBe(task.id)
  })

  it('getTaskLogs respects limit', () => {
    const task = store.taskRepo.createTask(taskInput({ scriptFolder: '/scripts/log2' }))
    for (let i = 0; i < 5; i++) {
      store.taskRepo.addTaskLog(task.id, 'info', `msg-${i}`)
    }
    expect(store.taskRepo.getTaskLogs(task.id, 3).length).toBe(3)
  })

  it('clearTaskLogs clears all logs and returns count', () => {
    const task = store.taskRepo.createTask(taskInput({ scriptFolder: '/scripts/clear' }))
    store.taskRepo.addTaskLog(task.id, 'info', 'msg1')
    store.taskRepo.addTaskLog(task.id, 'info', 'msg2')
    expect(store.taskRepo.clearTaskLogs()).toBe(2)
    expect(store.taskRepo.getTaskLogs(task.id)).toEqual([])
  })
})

// describe: 任务脚本模板 CRUD
describe('TaskTemplate CRUD', () => {
  it('createTaskTemplate and getTaskTemplate work correctly', () => {
    const template = store.createTaskTemplate(taskTemplateInput())
    expect(template.id).toBeDefined()
    expect(template.name).toBe('Demo Script')
    expect(store.getTaskTemplate(template.id)?.name).toBe('Demo Script')
  })

  it('listTaskTemplates returns items and pagination', () => {
    store.createTaskTemplate(taskTemplateInput({ name: 'A' }))
    store.createTaskTemplate(taskTemplateInput({ name: 'B', installPath: '/scripts/b' }))
    const result = store.listTaskTemplates(1, 10)
    expect(result.total).toBe(2)
    expect(result.items.length).toBe(2)
  })

  it('deleteTaskTemplate removes the template', () => {
    const template = store.createTaskTemplate(taskTemplateInput())
    expect(store.deleteTaskTemplate(template.id)).toBe(true)
    expect(store.getTaskTemplate(template.id)).toBeNull()
  })
})

// describe: 定时任务 CRUD
describe('ScheduledTask CRUD', () => {
  it('createScheduledTask and getScheduledTask work correctly', () => {
    const created = store.createScheduledTask({
      templateId: 'tmpl-1',
      config: {},
      cronExpression: '0 * * * *',
      enabled: true,
      lastRun: null,
      nextRun: null
    })
    expect(created.id).toBeDefined()
    expect(created.cronExpression).toBe('0 * * * *')
    expect(store.getScheduledTask(created.id)?.templateId).toBe('tmpl-1')
  })

  it('listScheduledTasks returns items', () => {
    store.createScheduledTask({
      templateId: 'tmpl-1',
      config: {},
      cronExpression: '0 * * * *',
      enabled: true,
      lastRun: null,
      nextRun: null
    })
    expect(store.listScheduledTasks(1, 10).total).toBe(1)
  })

  it('updateScheduledTask updates enabled flag', () => {
    const created = store.createScheduledTask({
      templateId: 'tmpl-1',
      config: {},
      cronExpression: '0 * * * *',
      enabled: true,
      lastRun: null,
      nextRun: null
    })
    const updated = store.updateScheduledTask(created.id, { enabled: false })
    expect(updated!.enabled).toBe(false)
  })

  it('deleteScheduledTask removes the task', () => {
    const created = store.createScheduledTask({
      templateId: 'tmpl-1',
      config: {},
      cronExpression: '0 * * * *',
      enabled: true,
      lastRun: null,
      nextRun: null
    })
    expect(store.deleteScheduledTask(created.id)).toBe(true)
    expect(store.getScheduledTask(created.id)).toBeNull()
  })
})

// describe: 设置键值存储测试
describe('Settings', () => {
  it('getSetting returns null when not set', () => {
    expect(store.getSetting('non-existent')).toBeNull()
  })

  it('setSetting and getSetting work correctly', () => {
    store.setSetting('theme', 'dark')
    expect(store.getSetting('theme')).toBe('dark')
  })

  it('setSetting overwrites existing value', () => {
    store.setSetting('theme', 'dark')
    store.setSetting('theme', 'light')
    expect(store.getSetting('theme')).toBe('light')
  })

  it('getAllSettings returns all settings', () => {
    store.setSetting('key1', 'val1')
    store.setSetting('key2', 'val2')
    const all = store.getAllSettings()
    expect(all.key1).toBe('val1')
    expect(all.key2).toBe('val2')
  })

  it('deleteSetting returns true on success', () => {
    store.setSetting('toDelete', 'val')
    expect(store.deleteSetting('toDelete')).toBe(true)
    expect(store.getSetting('toDelete')).toBeNull()
  })

  it('deleteSetting returns false when not exists', () => {
    expect(store.deleteSetting('non-existent')).toBe(false)
  })
})

// describe: 统计信息测试
describe('Stats', () => {
  it('getStats returns zero stats on empty database', () => {
    const stats = store.getStats()
    expect(stats.walletTotal).toBe(0)
    expect(stats.proxyTotal).toBe(0)
    expect(stats.scriptParamTotal).toBe(0)
    expect(stats.taskTotal).toBe(0)
    expect(stats.taskCompletedCount).toBe(0)
    expect(stats.taskErrorCount).toBe(0)
    expect(stats.totalFinishedTasks).toBe(0)
    expect(stats.taskSuccessRate).toBeNull()
    expect(stats.averageTaskDurationSecs).toBeNull()
    expect(stats.totalLogs).toBe(0)
    expect(stats.walletChainDistribution).toEqual({})
    expect(stats.proxyProtocolDistribution).toEqual({})
    expect(stats.proxyStatusDistribution).toEqual({})
    expect(stats.scriptParamPoolDistribution).toEqual({})
    expect(stats.taskStatusDistribution).toEqual({})
    expect(stats.taskDurationDistribution).toEqual({})
    expect(stats.taskTimeline).toEqual([])
    expect(stats.recentTaskResults).toEqual([])
    expect(stats.templateUsage).toEqual([])
    expect(stats.templateRanking).toEqual([])
    expect(stats.weeklyTrend).toEqual([])
  })

  it('getAppInfo returns correct structure', () => {
    const info = store.getAppInfo('1.0.0', '/data')
    expect(info.version).toBe('1.0.0')
    expect(info.dataDir).toBe('/data')
    expect(info.dbConnected).toBe(true)
    expect(info.dbError).toBeNull()
    expect(info.walletCount).toBe(0)
    expect(info.scriptParamCount).toBe(0)
    expect(info.proxyCount).toBe(0)
    expect(info.taskCount).toBe(0)
    expect(info.runningTaskCount).toBe(0)
  })

  it('getAppInfo counts entities correctly', () => {
    store.walletRepo.createWallet(walletInput({ address: '0x1' }))
    store.createScriptParam(scriptParamInput())
    store.proxyRepo.createProxy(proxyInput({ host: 'h' }))
    store.taskRepo.createTask(taskInput({ scriptFolder: '/s', status: 'running' }))

    const info = store.getAppInfo()
    expect(info.walletCount).toBe(1)
    expect(info.scriptParamCount).toBe(1)
    expect(info.proxyCount).toBe(1)
    expect(info.taskCount).toBe(1)
    expect(info.runningTaskCount).toBe(1)
  })
})

// describe: 应用日志测试
describe('AppLog', () => {
  it('addAppLog and listAppLogs work correctly', () => {
    store.addAppLog('info', 'system', 'started')
    store.addAppLog('error', 'network', 'connection failed', { code: 500 })

    const result = store.listAppLogs()
    expect(result.total).toBe(2)
    expect(result.items[0].level).toBe('error')
    expect(result.items[0].category).toBe('network')
    expect(result.items[0].message).toBe('connection failed')
    expect(result.items[0].fields).toEqual({ code: 500 })
  })

  it('listAppLogs search works', () => {
    store.addAppLog('info', 'system', 'boot complete')
    store.addAppLog('info', 'network', 'connected')
    const result = store.listAppLogs(1, 20, 'boot')
    expect(result.items.length).toBe(1)
    expect(result.items[0].message).toBe('boot complete')
  })

  it('queryLogs filters by level', () => {
    store.addAppLog('info', 'app', 'info msg')
    store.addAppLog('error', 'app', 'error msg')
    const result = store.queryLogs('error')
    expect(result.items.length).toBe(1)
    expect(result.items[0].level).toBe('error')
  })

  it('queryLogs filters by category', () => {
    store.addAppLog('info', 'system', 'sys msg')
    store.addAppLog('info', 'network', 'net msg')
    const result = store.queryLogs(undefined, 'network')
    expect(result.items.length).toBe(1)
    expect(result.items[0].category).toBe('network')
  })

  it('queryLogs filters by search', () => {
    store.addAppLog('info', 'app', 'hello world')
    store.addAppLog('info', 'app', 'goodbye')
    const result = store.queryLogs(undefined, undefined, 'hello')
    expect(result.items.length).toBe(1)
    expect(result.items[0].message).toBe('hello world')
  })

  it('queryLogs filters by since and until', () => {
    store.addAppLog('info', 'app', 'old msg')
    const futureDate = new Date(Date.now() + 100000).toISOString()
    const result = store.queryLogs(undefined, undefined, undefined, futureDate)
    expect(result.items.length).toBe(0)
  })

  it('getLogCategories returns distinct categories', () => {
    store.addAppLog('info', 'system', 'a')
    store.addAppLog('info', 'network', 'b')
    store.addAppLog('info', 'system', 'c')
    const categories = store.getLogCategories()
    expect(categories).toEqual(['network', 'system'])
  })
})

// describe: 空投项目 CRUD 操作测试
describe('Airdrop CRUD', () => {
  it('createAirdrop and getAirdrop work correctly', () => {
    const airdrop = store.createAirdrop(
      airdropInput({
        name: 'LayerZero',
        links: [{ label: 'Docs', url: 'https://example.com' }],
        tags: ['defi'],
        labels: ['hot']
      })
    )
    expect(airdrop.id).toBeDefined()
    expect(airdrop.createdAt).toBeDefined()
    expect(airdrop.updatedAt).toBeDefined()
    expect(airdrop.name).toBe('LayerZero')
    expect(airdrop.chain).toBe('Ethereum')
    expect(airdrop.status).toBe('ongoing')
    expect(airdrop.projectType).toBe('testnet')
    expect(airdrop.description).toBe('Airdrop project')
    expect(airdrop.links).toEqual([{ label: 'Docs', url: 'https://example.com' }])
    expect(airdrop.tags).toEqual(['defi'])
    expect(airdrop.labels).toEqual(['hot'])

    const fetched = store.getAirdrop(airdrop.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.id).toBe(airdrop.id)
  })

  it('getAirdrop returns null when not exists', () => {
    expect(store.getAirdrop('non-existent')).toBeNull()
  })

  it('listAirdrops returns paginated results', () => {
    for (let i = 0; i < 3; i++) {
      store.createAirdrop(airdropInput({ name: `Project ${i}`, website: `https://p${i}.com` }))
    }
    const result = store.listAirdrops(1, 2)
    expect(result.items.length).toBe(2)
    expect(result.total).toBe(3)
  })

  it('listAirdrops search works', () => {
    store.createAirdrop(airdropInput({ name: 'SpecialProject' }))
    store.createAirdrop(airdropInput({ name: 'OtherProject' }))
    const result = store.listAirdrops(1, 20, 'Special')
    expect(result.items.length).toBe(1)
    expect(result.items[0].name).toBe('SpecialProject')
  })

  it('updateAirdrop updates fields correctly', () => {
    const created = store.createAirdrop(airdropInput({ name: 'Old', description: 'old desc' }))
    const updated = store.updateAirdrop(created.id, {
      name: 'Updated',
      status: 'completed',
      description: 'new desc',
      tags: ['updated']
    })
    expect(updated).not.toBeNull()
    expect(updated!.name).toBe('Updated')
    expect(updated!.status).toBe('completed')
    expect(updated!.description).toBe('new desc')
    expect(updated!.tags).toEqual(['updated'])
  })

  it('updateAirdrop returns null when not exists', () => {
    expect(store.updateAirdrop('non-existent', { name: 'x' })).toBeNull()
  })

  it('deleteAirdrop returns true on success', () => {
    const created = store.createAirdrop(airdropInput({ name: 'ToDelete' }))
    expect(store.deleteAirdrop(created.id)).toBe(true)
    expect(store.getAirdrop(created.id)).toBeNull()
  })

  it('deleteAirdrop returns false when not exists', () => {
    expect(store.deleteAirdrop('non-existent')).toBe(false)
  })
})

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { StoreService } from '../../../src/main/services/store'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'

let store: StoreService

function createTempDbPath(): string {
  return join(tmpdir(), `test-store-${randomUUID()}.db`)
}

beforeEach(() => {
  store = new StoreService(createTempDbPath())
})

afterEach(() => {
  store.close()
})

describe('Wallet CRUD', () => {
  it('createWallet returns object with id, createdAt and correct fields', () => {
    const wallet = store.walletRepo.createWallet({
      address: '0xabc123',
      privateKey: 'pk-1',
      mnemonic: 'word1 word2',
      walletType: 'evm',
      labels: ['label1']
    })
    expect(wallet.id).toBeDefined()
    expect(typeof wallet.id).toBe('string')
    expect(wallet.createdAt).toBeDefined()
    expect(typeof wallet.createdAt).toBe('string')
    expect(wallet.address).toBe('0xabc123')
    expect(wallet.privateKey).toBe('pk-1')
    expect(wallet.mnemonic).toBe('word1 word2')
    expect(wallet.walletType).toBe('evm')
    expect(wallet.labels).toEqual(['label1'])
  })

  it('getWallet returns correct data when exists', () => {
    const created = store.walletRepo.createWallet({
      address: '0xdef456',
      privateKey: null,
      mnemonic: null,
      walletType: 'solana',
      labels: [],
      accountPool: 'test-pool'
    })
    const fetched = store.walletRepo.getWallet(created.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.id).toBe(created.id)
    expect(fetched!.address).toBe('0xdef456')
    expect(fetched!.walletType).toBe('solana')
  })

  it('getWallet returns null when not exists', () => {
    const result = store.walletRepo.getWallet('non-existent-id')
    expect(result).toBeNull()
  })

  it('listWallets returns empty list', () => {
    const result = store.walletRepo.listWallets()
    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
    expect(result.page).toBe(1)
  })

  it('listWallets pagination works correctly', () => {
    for (let i = 0; i < 5; i++) {
      store.walletRepo.createWallet({
        address: `0x${i}`,
        privateKey: null,
        mnemonic: null,
        walletType: 'evm',
        labels: [],
        accountPool: 'test-pool'
      })
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
    store.walletRepo.createWallet({
      address: '0xsearchable',
      privateKey: null,
      mnemonic: null,
      walletType: 'evm',
      labels: [],
      accountPool: 'test-pool'
    })
    store.walletRepo.createWallet({
      address: '0xother',
      privateKey: null,
      mnemonic: null,
      walletType: 'solana',
      labels: [],
      accountPool: 'test-pool'
    })
    const result = store.walletRepo.listWallets(1, 20, 'searchable')
    expect(result.items.length).toBe(1)
    expect(result.items[0].address).toBe('0xsearchable')
  })

  it('updateWallet updates fields correctly', () => {
    const created = store.walletRepo.createWallet({
      address: '0xbefore',
      privateKey: null,
      mnemonic: null,
      walletType: 'evm',
      labels: [],
      accountPool: 'test-pool'
    })
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
    const result = store.walletRepo.updateWallet('non-existent', { address: '0xnope' })
    expect(result).toBeNull()
  })

  it('deleteWallet returns true on success', () => {
    const created = store.walletRepo.createWallet({
      address: '0xtodelete',
      privateKey: null,
      mnemonic: null,
      walletType: 'evm',
      labels: [],
      accountPool: 'test-pool'
    })
    const result = store.walletRepo.deleteWallet(created.id)
    expect(result).toBe(true)
    expect(store.walletRepo.getWallet(created.id)).toBeNull()
  })

  it('deleteWallet returns false when not exists', () => {
    const result = store.walletRepo.deleteWallet('non-existent')
    expect(result).toBe(false)
  })

  it('batchCreateWallets creates correct count', () => {
    const items = [
      {
        address: '0xb1',
        privateKey: null,
        mnemonic: null,
        walletType: 'evm',
        labels: [],
        accountPool: 'test-pool'
      },
      {
        address: '0xb2',
        privateKey: null,
        mnemonic: null,
        walletType: 'evm',
        labels: [],
        accountPool: 'test-pool'
      },
      { address: '0xb3', privateKey: null, mnemonic: null, walletType: 'solana', labels: ['batch'] }
    ]
    const count = store.walletRepo.batchCreateWallets(items)
    expect(count).toBe(3)
    const list = store.walletRepo.listWallets()
    expect(list.total).toBe(3)
  })

  it('batchDeleteWallets deletes correct count', () => {
    const w1 = store.walletRepo.createWallet({
      address: '0xbd1',
      privateKey: null,
      mnemonic: null,
      walletType: 'evm',
      labels: [],
      accountPool: 'test-pool'
    })
    const w2 = store.walletRepo.createWallet({
      address: '0xbd2',
      privateKey: null,
      mnemonic: null,
      walletType: 'evm',
      labels: [],
      accountPool: 'test-pool'
    })
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const w3 = store.walletRepo.createWallet({
      address: '0xbd3',
      privateKey: null,
      mnemonic: null,
      walletType: 'evm',
      labels: [],
      accountPool: 'test-pool'
    })
    const deleted = store.walletRepo.batchDeleteWallets([w1.id, w2.id, 'non-existent'])
    expect(deleted).toBe(2)
    expect(store.walletRepo.listWallets().total).toBe(1)
  })
})

describe('Account CRUD', () => {
  it('createAccount and getAccount work correctly', () => {
    const account = store.createAccount({
      templateId: 'tmpl-1',
      data: { key: 'value' },
      pool: 'pool-a',
      labels: ['acct'],
      notes: 'test note'
    })
    expect(account.id).toBeDefined()
    expect(account.createdAt).toBeDefined()
    expect(account.updatedAt).toBeDefined()
    expect(account.templateId).toBe('tmpl-1')
    expect(account.data).toEqual({ key: 'value' })
    expect(account.pool).toBe('pool-a')
    expect(account.labels).toEqual(['acct'])
    expect(account.notes).toBe('test note')

    const fetched = store.getAccount(account.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.id).toBe(account.id)
  })

  it('getAccount returns null when not exists', () => {
    expect(store.getAccount('non-existent')).toBeNull()
  })

  it('listAccounts returns paginated results', () => {
    for (let i = 0; i < 3; i++) {
      store.createAccount({
        templateId: `tmpl-${i}`,
        data: {},
        pool: `pool-${i}`,
        labels: [],
        accountPool: 'test-pool',
        notes: ''
      })
    }
    const result = store.listAccounts(1, 2)
    expect(result.items.length).toBe(2)
    expect(result.total).toBe(3)
  })

  it('listAccounts search works', () => {
    store.createAccount({
      templateId: 't1',
      data: {},
      pool: 'special-pool',
      labels: [],
      accountPool: 'test-pool',
      notes: ''
    })
    store.createAccount({
      templateId: 't2',
      data: {},
      pool: 'other',
      labels: [],
      accountPool: 'test-pool',
      notes: ''
    })
    const result = store.listAccounts(1, 20, 'special')
    expect(result.items.length).toBe(1)
  })

  it('updateAccount updates fields correctly', () => {
    const created = store.createAccount({
      templateId: 'tmpl-old',
      data: {},
      pool: 'old-pool',
      labels: [],
      accountPool: 'test-pool',
      notes: 'old'
    })
    const updated = store.updateAccount(created.id, {
      pool: 'new-pool',
      notes: 'new'
    })
    expect(updated).not.toBeNull()
    expect(updated!.pool).toBe('new-pool')
    expect(updated!.notes).toBe('new')
    expect(typeof updated!.updatedAt).toBe('string')
  })

  it('updateAccount returns null when not exists', () => {
    expect(store.updateAccount('non-existent', { pool: 'x' })).toBeNull()
  })

  it('deleteAccount returns true on success', () => {
    const created = store.createAccount({
      templateId: 't1',
      data: {},
      pool: 'p',
      labels: [],
      accountPool: 'test-pool',
      notes: ''
    })
    expect(store.deleteAccount(created.id)).toBe(true)
    expect(store.getAccount(created.id)).toBeNull()
  })

  it('deleteAccount returns false when not exists', () => {
    expect(store.deleteAccount('non-existent')).toBe(false)
  })
})

describe('Proxy CRUD', () => {
  it('createProxy and getProxy work correctly', () => {
    const proxy = store.proxyRepo.createProxy({
      protocol: 'http',
      host: '127.0.0.1',
      port: 8080,
      username: 'user',
      password: 'pass',
      status: 'active',
      labels: ['proxy1']
    })
    expect(proxy.id).toBeDefined()
    expect(proxy.createdAt).toBeDefined()
    expect(proxy.protocol).toBe('http')
    expect(proxy.host).toBe('127.0.0.1')
    expect(proxy.port).toBe(8080)
    expect(proxy.username).toBe('user')
    expect(proxy.password).toBe('pass')
    expect(proxy.status).toBe('active')
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
      store.proxyRepo.createProxy({
        protocol: 'http',
        host: `host${i}`,
        port: 8080 + i,
        username: null,
        password: null,
        status: 'active',
        labels: [],
        accountPool: 'test-pool'
      })
    }
    const result = store.proxyRepo.listProxies(1, 2)
    expect(result.items.length).toBe(2)
    expect(result.total).toBe(4)
  })

  it('listProxies search works', () => {
    store.proxyRepo.createProxy({
      protocol: 'socks5',
      host: 'target',
      port: 1080,
      username: null,
      password: null,
      status: 'active',
      labels: [],
      accountPool: 'test-pool'
    })
    store.proxyRepo.createProxy({
      protocol: 'http',
      host: 'other',
      port: 8080,
      username: null,
      password: null,
      status: 'active',
      labels: [],
      accountPool: 'test-pool'
    })
    const result = store.proxyRepo.listProxies(1, 20, 'target')
    expect(result.items.length).toBe(1)
  })

  it('updateProxy updates fields correctly', () => {
    const created = store.proxyRepo.createProxy({
      protocol: 'http',
      host: 'old-host',
      port: 8080,
      username: null,
      password: null,
      status: 'active',
      labels: [],
      accountPool: 'test-pool'
    })
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

  it('updateProxy returns null when not exists', () => {
    expect(store.proxyRepo.updateProxy('non-existent', { host: 'x' })).toBeNull()
  })

  it('deleteProxy returns true on success', () => {
    const created = store.proxyRepo.createProxy({
      protocol: 'http',
      host: 'del',
      port: 8080,
      username: null,
      password: null,
      status: 'active',
      labels: [],
      accountPool: 'test-pool'
    })
    expect(store.proxyRepo.deleteProxy(created.id)).toBe(true)
    expect(store.proxyRepo.getProxy(created.id)).toBeNull()
  })

  it('deleteProxy returns false when not exists', () => {
    expect(store.proxyRepo.deleteProxy('non-existent')).toBe(false)
  })
})

describe('Task CRUD', () => {
  it('createTask and getTask work correctly', () => {
    const task = store.taskRepo.createTask({
      scriptFolder: '/scripts/task1',
      config: { param: 1 },
      status: 'idle',
      workerId: null,
      startedAt: null,
      endedAt: null,
      isSandbox: false
    })
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
      store.taskRepo.createTask({
        scriptFolder: `/scripts/t${i}`,
        config: {},
        status: 'idle',
        workerId: null,
        startedAt: null,
        endedAt: null,
        isSandbox: false
      })
    }
    const result = store.taskRepo.listTasks(1, 2)
    expect(result.items.length).toBe(2)
    expect(result.total).toBe(3)
  })

  it('listTasks search works', () => {
    store.taskRepo.createTask({
      scriptFolder: '/scripts/special',
      config: {},
      status: 'running',
      workerId: null,
      startedAt: null,
      endedAt: null,
      isSandbox: false
    })
    store.taskRepo.createTask({
      scriptFolder: '/scripts/other',
      config: {},
      status: 'idle',
      workerId: null,
      startedAt: null,
      endedAt: null,
      isSandbox: false
    })
    const result = store.taskRepo.listTasks(1, 20, 'special')
    expect(result.items.length).toBe(1)
  })

  it('updateTask updates fields correctly', () => {
    const created = store.taskRepo.createTask({
      scriptFolder: '/scripts/old',
      config: {},
      status: 'idle',
      workerId: null,
      startedAt: null,
      endedAt: null,
      isSandbox: false
    })
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

  it('deleteTask returns true on success', () => {
    const created = store.taskRepo.createTask({
      scriptFolder: '/scripts/del',
      config: {},
      status: 'idle',
      workerId: null,
      startedAt: null,
      endedAt: null,
      isSandbox: false
    })
    expect(store.taskRepo.deleteTask(created.id)).toBe(true)
    expect(store.taskRepo.getTask(created.id)).toBeNull()
  })

  it('deleteTask returns false when not exists', () => {
    expect(store.taskRepo.deleteTask('non-existent')).toBe(false)
  })

  it('addTaskLog and getTaskLogs work correctly', () => {
    const task = store.taskRepo.createTask({
      scriptFolder: '/scripts/log',
      config: {},
      status: 'idle',
      workerId: null,
      startedAt: null,
      endedAt: null,
      isSandbox: false
    })
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
    const task = store.taskRepo.createTask({
      scriptFolder: '/scripts/log2',
      config: {},
      status: 'idle',
      workerId: null,
      startedAt: null,
      endedAt: null,
      isSandbox: false
    })
    for (let i = 0; i < 5; i++) {
      store.taskRepo.addTaskLog(task.id, 'info', `msg-${i}`)
    }
    const logs = store.taskRepo.getTaskLogs(task.id, 3)
    expect(logs.length).toBe(3)
  })

  it('clearTaskLogs clears all logs and returns count', () => {
    const task = store.taskRepo.createTask({
      scriptFolder: '/scripts/clear',
      config: {},
      status: 'idle',
      workerId: null,
      startedAt: null,
      endedAt: null,
      isSandbox: false
    })
    store.taskRepo.addTaskLog(task.id, 'info', 'msg1')
    store.taskRepo.addTaskLog(task.id, 'info', 'msg2')
    const count = store.taskRepo.clearTaskLogs()
    expect(count).toBe(2)
    expect(store.taskRepo.getTaskLogs(task.id)).toEqual([])
  })
})

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

describe('Stats', () => {
  it('getStats returns zero stats on empty database', () => {
    const stats = store.getStats()
    expect(stats.walletTotal).toBe(0)
    expect(stats.proxyTotal).toBe(0)
    expect(stats.accountTotal).toBe(0)
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
    expect(stats.accountPoolDistribution).toEqual({})
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
    expect(info.accountCount).toBe(0)
    expect(info.proxyCount).toBe(0)
    expect(info.taskCount).toBe(0)
    expect(info.runningTaskCount).toBe(0)
  })

  it('getAppInfo counts entities correctly', () => {
    store.walletRepo.createWallet({
      address: '0x1',
      privateKey: null,
      mnemonic: null,
      walletType: 'evm',
      labels: [],
      accountPool: 'test-pool'
    })
    store.createAccount({
      templateId: 't1',
      data: {},
      pool: 'p',
      labels: [],
      accountPool: 'test-pool',
      notes: ''
    })
    store.proxyRepo.createProxy({
      protocol: 'http',
      host: 'h',
      port: 8080,
      username: null,
      password: null,
      status: 'active',
      labels: [],
      accountPool: 'test-pool'
    })
    store.taskRepo.createTask({
      scriptFolder: '/s',
      config: {},
      status: 'running',
      workerId: null,
      startedAt: null,
      endedAt: null,
      isSandbox: false
    })

    const info = store.getAppInfo()
    expect(info.walletCount).toBe(1)
    expect(info.accountCount).toBe(1)
    expect(info.proxyCount).toBe(1)
    expect(info.taskCount).toBe(1)
    expect(info.runningTaskCount).toBe(1)
  })
})

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

describe('Airdrop CRUD', () => {
  it('createAirdrop and getAirdrop work correctly', () => {
    const airdrop = store.createAirdrop({
      name: 'LayerZero',
      chain: 'Ethereum',
      status: 'ongoing',
      projectType: 'infrastructure',
      description: 'Airdrop project',
      website: 'https://layerzero.network',
      accountPool: 'default',
      links: [{ url: 'https://example.com' }],
      eligibilityCriteria: [{ criterion: 'hold token' }],
      tasks: [{ task: 'bridge' }],
      earnings: [{ amount: 100 }],
      tags: ['defi'],
      labels: ['hot']
    })
    expect(airdrop.id).toBeDefined()
    expect(airdrop.createdAt).toBeDefined()
    expect(airdrop.updatedAt).toBeDefined()
    expect(airdrop.name).toBe('LayerZero')
    expect(airdrop.chain).toBe('Ethereum')
    expect(airdrop.status).toBe('ongoing')
    expect(airdrop.projectType).toBe('infrastructure')
    expect(airdrop.description).toBe('Airdrop project')
    expect(airdrop.links).toEqual([{ url: 'https://example.com' }])
    expect(airdrop.eligibilityCriteria).toEqual([{ criterion: 'hold token' }])
    expect(airdrop.tasks).toEqual([{ task: 'bridge' }])
    expect(airdrop.earnings).toEqual([{ amount: 100 }])
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
      store.createAirdrop({
        name: `Project ${i}`,
        chain: 'Ethereum',
        status: 'ongoing',
        projectType: 'other',
        description: '',
        website: `https://project${i}.com`,
        links: [],
        eligibilityCriteria: [],
        tasks: [],
        earnings: [],
        tags: [],
        labels: [],
        accountPool: 'test-pool'
      })
    }
    const result = store.listAirdrops(1, 2)
    expect(result.items.length).toBe(2)
    expect(result.total).toBe(3)
  })

  it('listAirdrops search works', () => {
    store.createAirdrop({
      name: 'SpecialProject',
      chain: 'Solana',
      status: 'ongoing',
      projectType: 'other',
      description: '',
      website: 'https://special.com',
      links: [],
      eligibilityCriteria: [],
      tasks: [],
      earnings: [],
      tags: [],
      labels: [],
      accountPool: 'test-pool'
    })
    store.createAirdrop({
      name: 'OtherProject',
      chain: 'Ethereum',
      status: 'ongoing',
      projectType: 'other',
      description: '',
      website: 'https://other.com',
      links: [],
      eligibilityCriteria: [],
      tasks: [],
      earnings: [],
      tags: [],
      labels: [],
      accountPool: 'test-pool'
    })
    const result = store.listAirdrops(1, 20, 'Special')
    expect(result.items.length).toBe(1)
    expect(result.items[0].name).toBe('SpecialProject')
  })

  it('updateAirdrop updates fields correctly', () => {
    const created = store.createAirdrop({
      name: 'Old',
      chain: 'Ethereum',
      status: 'ongoing',
      projectType: 'other',
      description: 'old desc',
      website: 'https://old.com',
      links: [],
      eligibilityCriteria: [],
      tasks: [],
      earnings: [],
      tags: [],
      labels: [],
      accountPool: 'test-pool'
    })
    const updated = store.updateAirdrop(created.id, {
      name: 'Updated',
      status: 'ended',
      description: 'new desc',
      tags: ['updated']
    })
    expect(updated).not.toBeNull()
    expect(updated!.name).toBe('Updated')
    expect(updated!.status).toBe('ended')
    expect(updated!.description).toBe('new desc')
    expect(updated!.tags).toEqual(['updated'])
  })

  it('updateAirdrop returns null when not exists', () => {
    expect(store.updateAirdrop('non-existent', { name: 'x' })).toBeNull()
  })

  it('deleteAirdrop returns true on success', () => {
    const created = store.createAirdrop({
      name: 'ToDelete',
      chain: 'Ethereum',
      status: 'ongoing',
      projectType: 'other',
      description: '',
      website: 'https://delete.com',
      links: [],
      eligibilityCriteria: [],
      tasks: [],
      earnings: [],
      tags: [],
      labels: [],
      accountPool: 'test-pool'
    })
    expect(store.deleteAirdrop(created.id)).toBe(true)
    expect(store.getAirdrop(created.id)).toBeNull()
  })

  it('deleteAirdrop returns false when not exists', () => {
    expect(store.deleteAirdrop('non-existent')).toBe(false)
  })
})

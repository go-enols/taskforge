/**
 * @file StoreService — SQLite 数据访问层（核心持久层）
 * @description 封装所有数据表的 CRUD 操作，采用 better-sqlite3 同步 API + 预编译语句。
 *              JSON 字段自动序列化/反序列化，提供钱包、账户、代理、任务、空投项目、
 *              模板、设置、验证码密钥、代理提供商、应用日志等实体的统一数据访问接口。
 *              内部维护 WalletRepository / ProxyRepository / TaskRepository 三个子仓库。
 * @module main/services
 */

import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import type {
  Wallet,
  Account,
  Proxy,
  Task,
  TaskLog,
  Template,
  TaskTemplate,
  ScheduledTask,
  AirdropProject,
  AirdropAnalytics,
  TokenEarnings,
  UpcomingDeadline,
  CaptchaKey,
  ProxyProvider,
  AppLog,
  ListResponse,
  AppInfo,
  StatsAggregate,
  TaskTimelineEntry,
  RecentTaskResult,
  TemplateUsage,
  TemplateRanking,
  WeeklyTrend
} from '../../shared/types'
import { WalletRepository } from './repositories/wallet'
import { ProxyRepository } from './repositories/proxy'
import { TaskRepository } from './repositories/task'
import { Logger } from '../utils/logger'

export type {
  Wallet,
  Account,
  Proxy,
  Task,
  TaskLog,
  Template,
  TaskTemplate,
  ScheduledTask,
  AirdropProject,
  CaptchaKey,
  ProxyProvider,
  AppLog,
  ListResponse,
  AppInfo,
  StatsAggregate,
  TaskTimelineEntry,
  RecentTaskResult,
  TemplateUsage,
  TemplateRanking,
  WeeklyTrend
}

/** JSON 字段类型：数据库中存储 JSON 的列使用 TEXT 或 NULL */
type JsonField = string | null

/** 内部辅助：将任意值序列化为 JSON 字符串（undefined/null 返回 null） */
function toJson(val: unknown): JsonField {
  if (val === undefined || val === null) return null
  return JSON.stringify(val)
}

/**
 * 内部辅助：从 JSON 字符串解析为对象
 * - 解析失败时返回 null（不抛错，容错处理）
 */
function fromJson<T>(val: JsonField): T | null {
  if (val === null) return null
  try {
    return JSON.parse(val) as T
  } catch {
    return null
  }
}

/**
 * 内部辅助：从 JSON 字符串解析为数组
 * - 解析失败或 null 时返回空数组（不抛错）
 */
function fromJsonArray<T>(val: JsonField): T[] {
  if (val === null) return []
  try {
    return JSON.parse(val) as T[]
  } catch {
    return []
  }
}

/** 内部辅助：生成 ISO 8601 格式的当前时间字符串 */
function nowISO(): string {
  return new Date().toISOString()
}

/**
 * 数据访问服务（单例模式，通过构造函数传入 dbPath 初始化）
 *
 * 职责范围：
 * - 初始化 SQLite 数据库（WAL 模式 + 外键约束）
 * - 自动建表与迁移（向后兼容）
 * - 预编译所有 SQL 语句以提升性能
 * - 提供每个实体类型的完整 CRUD + 分页搜索
 * - 聚合/统计查询（Dashboard 数据）
 * - 委托子仓库处理特定逻辑（钱包、代理、任务）
 *
 * @example
 * ```ts
 * const store = new StoreService('path/to/taskforge.db')
 * const wallets = store.walletRepo.listWallets()
 * const accounts = store.listAccounts(1, 20, 'search term')
 * ```
 */
export class StoreService {
  /** SQLite 数据库连接实例 */
  private db: Database.Database
  /** 预编译语句缓存（名称 → PreparedStatement） */
  private stmts: Map<string, Database.Statement>
  /** 钱包子仓库 */
  private _walletRepo: WalletRepository
  /** 代理子仓库 */
  private _proxyRepo: ProxyRepository
  /** 任务子仓库 */
  private _taskRepo: TaskRepository

  /**
   * @param dbPath - SQLite 数据库文件路径
   * @param encryption - 可选的加密服务实例，用于钱包私钥加密存储
   */
  constructor(dbPath: string, encryption?: import('./encryption').EncryptionService) {
    this.db = new Database(dbPath)
    this.stmts = new Map()
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.initialize()
    this.prepareStatements()
    this._walletRepo = new WalletRepository(this.db, encryption)
    this._proxyRepo = new ProxyRepository(this.db)
    this._taskRepo = new TaskRepository(this.db)
    Logger.setDbLogger((level, category, message, fields) => {
      this.addAppLog(level, category, message, fields)
    })
  }

  /** 获取钱包子仓库（委托模式） */
  get walletRepo(): WalletRepository {
    return this._walletRepo
  }

  /** 获取代理子仓库（委托模式） */
  get proxyRepo(): ProxyRepository {
    return this._proxyRepo
  }

  /** 获取任务子仓库（委托模式） */
  get taskRepo(): TaskRepository {
    return this._taskRepo
  }

  /** 数据库初始化：创建所有表和索引，执行向后兼容的数据库迁移 */
  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS wallets (
        id TEXT PRIMARY KEY,
        address TEXT NOT NULL,
        private_key TEXT,
        mnemonic TEXT,
        wallet_type TEXT NOT NULL,
        labels TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        data TEXT NOT NULL DEFAULT '{}',
        pool TEXT NOT NULL DEFAULT '',
        labels TEXT NOT NULL DEFAULT '[]',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS proxies (
        id TEXT PRIMARY KEY,
        protocol TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        username TEXT,
        password TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        format TEXT NOT NULL DEFAULT 'manual',
        labels TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        script_folder TEXT NOT NULL,
        config TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'idle',
        worker_id TEXT,
        started_at TEXT,
        ended_at TEXT,
        is_sandbox INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS task_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        level TEXT NOT NULL,
        message TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        schema TEXT NOT NULL DEFAULT '{}',
        version TEXT NOT NULL DEFAULT '',
        is_local INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS task_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        version TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        install_path TEXT NOT NULL DEFAULT '',
        manifest TEXT NOT NULL DEFAULT '{}',
        remote_url TEXT,
        is_installed INTEGER NOT NULL DEFAULT 0,
        downloaded_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        config TEXT NOT NULL DEFAULT '{}',
        cron_expression TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_run TEXT,
        next_run TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS airdrop_projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        chain TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'ongoing',
        project_type TEXT NOT NULL DEFAULT 'other',
        description TEXT NOT NULL DEFAULT '',
        website TEXT NOT NULL DEFAULT '',
        script_template_id TEXT,
        account_pool TEXT NOT NULL DEFAULT '',
        links TEXT NOT NULL DEFAULT '[]',
        eligibility_criteria TEXT NOT NULL DEFAULT '[]',
        tasks TEXT NOT NULL DEFAULT '[]',
        earnings TEXT NOT NULL DEFAULT '[]',
        tags TEXT NOT NULL DEFAULT '[]',
        labels TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS captcha_keys (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        api_key TEXT NOT NULL,
        balance REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS proxy_providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        api_url TEXT NOT NULL,
        api_key TEXT NOT NULL DEFAULT '',
        protocol TEXT NOT NULL DEFAULT 'http',
        refresh_interval INTEGER NOT NULL DEFAULT 0,
        last_sync TEXT,
        labels TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        level TEXT NOT NULL,
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        fields TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_task_logs_task_id ON task_logs(task_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_wallets_wallet_type ON wallets(wallet_type);
      CREATE INDEX IF NOT EXISTS idx_proxies_status ON proxies(status);
      CREATE INDEX IF NOT EXISTS idx_accounts_pool ON accounts(pool);
      CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_enabled ON scheduled_tasks(enabled);
      CREATE INDEX IF NOT EXISTS idx_airdrop_projects_status ON airdrop_projects(status);
      CREATE INDEX IF NOT EXISTS idx_app_logs_category ON app_logs(category);
    `)
    // Migrations: add columns that may be missing from existing tables
    this.migrateAirdropProjects()
    this.migrateProxies()
  }

  /** 迁移：为 airdrop_projects 表添加后续新增的字段（website, script_template_id, account_pool） */
  private migrateAirdropProjects(): void {
    const cols = this.db.prepare("PRAGMA table_info('airdrop_projects')").all() as Array<{
      name: string
    }>
    const names = new Set(cols.map((c) => c.name))
    const migrations: Record<string, string> = {
      website: "ALTER TABLE airdrop_projects ADD COLUMN website TEXT NOT NULL DEFAULT ''",
      script_template_id: 'ALTER TABLE airdrop_projects ADD COLUMN script_template_id TEXT',
      account_pool: "ALTER TABLE airdrop_projects ADD COLUMN account_pool TEXT NOT NULL DEFAULT ''"
    }
    for (const [col, sql] of Object.entries(migrations)) {
      if (!names.has(col)) {
        this.db.exec(sql)
      }
    }
  }

  /** 迁移：为 proxies 表添加 format 字段（V1.1 新增代理格式类型） */
  private migrateProxies(): void {
    const cols = this.db.prepare("PRAGMA table_info('proxies')").all() as Array<{ name: string }>
    const names = new Set(cols.map((c) => c.name))
    if (!names.has('format')) {
      this.db.exec("ALTER TABLE proxies ADD COLUMN format TEXT NOT NULL DEFAULT 'manual'")
    }
  }

  /** 预编译所有 SQL 语句并缓存到 this.stmts Map 中 */
  private prepareStatements(): void {
    const s = this.stmts
    const db = this.db

    s.set(
      'account.insert',
      db.prepare(
        'INSERT INTO accounts (id, template_id, data, pool, labels, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
    )
    s.set('account.getById', db.prepare('SELECT * FROM accounts WHERE id = ?'))
    s.set(
      'account.update',
      db.prepare(
        'UPDATE accounts SET template_id=?, data=?, pool=?, labels=?, notes=?, updated_at=? WHERE id=?'
      )
    )
    s.set('account.delete', db.prepare('DELETE FROM accounts WHERE id = ?'))
    s.set('account.count', db.prepare('SELECT COUNT(*) as cnt FROM accounts'))
    s.set(
      'account.countByPool',
      db.prepare('SELECT pool, COUNT(*) as cnt FROM accounts GROUP BY pool')
    )

    s.set(
      'template.insert',
      db.prepare(
        'INSERT INTO templates (id, type, name, schema, version, is_local, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
    )
    s.set('template.getById', db.prepare('SELECT * FROM templates WHERE id = ?'))
    s.set(
      'template.update',
      db.prepare(
        'UPDATE templates SET type=?, name=?, schema=?, version=?, is_local=?, updated_at=? WHERE id=?'
      )
    )
    s.set('template.delete', db.prepare('DELETE FROM templates WHERE id = ?'))

    s.set(
      'taskTemplate.insert',
      db.prepare(
        'INSERT INTO task_templates (id, name, version, description, install_path, manifest, remote_url, is_installed, downloaded_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
    )
    s.set('taskTemplate.getById', db.prepare('SELECT * FROM task_templates WHERE id = ?'))
    s.set(
      'taskTemplate.update',
      db.prepare(
        'UPDATE task_templates SET name=?, version=?, description=?, install_path=?, manifest=?, remote_url=?, is_installed=?, downloaded_at=?, updated_at=? WHERE id=?'
      )
    )
    s.set('taskTemplate.delete', db.prepare('DELETE FROM task_templates WHERE id = ?'))

    s.set(
      'scheduledTask.insert',
      db.prepare(
        'INSERT INTO scheduled_tasks (id, template_id, config, cron_expression, enabled, last_run, next_run, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
    )
    s.set('scheduledTask.getById', db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?'))
    s.set(
      'scheduledTask.update',
      db.prepare(
        'UPDATE scheduled_tasks SET template_id=?, config=?, cron_expression=?, enabled=?, last_run=?, next_run=? WHERE id=?'
      )
    )
    s.set('scheduledTask.delete', db.prepare('DELETE FROM scheduled_tasks WHERE id = ?'))

    s.set(
      'airdrop.insert',
      db.prepare(
        'INSERT INTO airdrop_projects (id, name, chain, status, project_type, description, website, script_template_id, account_pool, links, eligibility_criteria, tasks, earnings, tags, labels, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
    )
    s.set('airdrop.getById', db.prepare('SELECT * FROM airdrop_projects WHERE id = ?'))
    s.set(
      'airdrop.update',
      db.prepare(
        'UPDATE airdrop_projects SET name=?, chain=?, status=?, project_type=?, description=?, website=?, script_template_id=?, account_pool=?, links=?, eligibility_criteria=?, tasks=?, earnings=?, tags=?, labels=?, updated_at=? WHERE id=?'
      )
    )
    s.set('airdrop.delete', db.prepare('DELETE FROM airdrop_projects WHERE id = ?'))

    s.set('setting.get', db.prepare('SELECT value FROM settings WHERE key = ?'))
    s.set('setting.set', db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'))
    s.set('setting.delete', db.prepare('DELETE FROM settings WHERE key = ?'))
    s.set('setting.getAll', db.prepare('SELECT key, value FROM settings'))

    s.set(
      'captchaKey.insert',
      db.prepare(
        'INSERT INTO captcha_keys (id, provider, api_key, balance, created_at) VALUES (?, ?, ?, ?, ?)'
      )
    )
    s.set('captchaKey.getById', db.prepare('SELECT * FROM captcha_keys WHERE id = ?'))
    s.set(
      'captchaKey.update',
      db.prepare('UPDATE captcha_keys SET provider=?, api_key=?, balance=? WHERE id=?')
    )
    s.set('captchaKey.delete', db.prepare('DELETE FROM captcha_keys WHERE id = ?'))

    s.set(
      'proxyProvider.insert',
      db.prepare(
        'INSERT INTO proxy_providers (id, name, api_url, api_key, protocol, refresh_interval, last_sync, labels, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
    )
    s.set('proxyProvider.getById', db.prepare('SELECT * FROM proxy_providers WHERE id = ?'))
    s.set(
      'proxyProvider.update',
      db.prepare(
        'UPDATE proxy_providers SET name=?, api_url=?, api_key=?, protocol=?, refresh_interval=?, last_sync=?, labels=? WHERE id=?'
      )
    )
    s.set('proxyProvider.delete', db.prepare('DELETE FROM proxy_providers WHERE id = ?'))

    s.set(
      'appLog.insert',
      db.prepare(
        'INSERT INTO app_logs (timestamp, level, category, message, fields) VALUES (?, ?, ?, ?, ?)'
      )
    )
  }

  /**
   * 从缓存中获取预编译语句
   *
   * @param name - 语句名称（prepareStatements 中注册的 key）
   * @returns 缓存的 PreparedStatement
   * @throws 未找到时抛出 Error
   */
  private stmt(name: string): Database.Statement {
    const s = this.stmts.get(name)
    if (!s) throw new Error(`Prepared statement not found: ${name}`)
    return s
  }

  /** 行映射：数据库行 → Account 对象（自动反序列化 data/labels JSON 字段） */
  private rowToAccount(row: Record<string, unknown>): Account {
    return {
      id: row.id as string,
      templateId: row.template_id as string,
      data: fromJson<Record<string, unknown>>(row.data as JsonField) ?? {},
      pool: row.pool as string,
      labels: fromJsonArray<string>(row.labels as JsonField),
      notes: row.notes as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string
    }
  }

  /** 行映射：数据库行 → Template 对象（自动反序列化 schema JSON 字段） */
  private rowToTemplate(row: Record<string, unknown>): Template {
    return {
      id: row.id as string,
      type: row.type as string,
      name: row.name as string,
      schema: fromJson<Record<string, unknown>>(row.schema as JsonField) ?? {},
      version: row.version as string,
      isLocal: (row.is_local as number) === 1,
      updatedAt: row.updated_at as string
    }
  }

  /** 行映射：数据库行 → TaskTemplate 对象（自动反序列化 manifest JSON 字段） */
  private rowToTaskTemplate(row: Record<string, unknown>): TaskTemplate {
    return {
      id: row.id as string,
      name: row.name as string,
      version: row.version as string,
      description: row.description as string,
      installPath: row.install_path as string,
      manifest: fromJson<Record<string, unknown>>(row.manifest as JsonField) ?? {},
      remoteUrl: row.remote_url as string | null,
      isInstalled: (row.is_installed as number) === 1,
      downloadedAt: row.downloaded_at as string,
      updatedAt: row.updated_at as string
    }
  }

  /** 行映射：数据库行 → ScheduledTask 对象（自动反序列化 config JSON 字段） */
  private rowToScheduledTask(row: Record<string, unknown>): ScheduledTask {
    return {
      id: row.id as string,
      templateId: row.template_id as string,
      config: fromJson<Record<string, unknown>>(row.config as JsonField) ?? {},
      cronExpression: row.cron_expression as string,
      enabled: (row.enabled as number) === 1,
      lastRun: row.last_run as string | null,
      nextRun: row.next_run as string | null,
      createdAt: row.created_at as string
    }
  }

  /** 行映射：数据库行 → AirdropProject 对象（反序列化 links/tasks/earnings/tags/labels JSON 字段） */
  private rowToAirdropProject(row: Record<string, unknown>): AirdropProject {
    return {
      id: row.id as string,
      name: row.name as string,
      chain: row.chain as string,
      status: row.status as AirdropProject['status'],
      projectType: row.project_type as AirdropProject['projectType'],
      description: row.description as string,
      website: row.website as string,
      scriptTemplateId: row.script_template_id as string | undefined,
      accountPool: row.account_pool as string,
      links: fromJsonArray(row.links as JsonField),
      eligibilityCriteria: fromJsonArray(row.eligibility_criteria as JsonField),
      tasks: fromJsonArray(row.tasks as JsonField),
      earnings: fromJsonArray(row.earnings as JsonField),
      tags: fromJsonArray<string>(row.tags as JsonField),
      labels: fromJsonArray<string>(row.labels as JsonField),
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string
    }
  }

  /** 行映射：数据库行 → CaptchaKey 对象 */
  private rowToCaptchaKey(row: Record<string, unknown>): CaptchaKey {
    return {
      id: row.id as string,
      provider: row.provider as string,
      apiKey: row.api_key as string,
      balance: row.balance as number,
      createdAt: row.created_at as string
    }
  }

  /** 行映射：数据库行 → ProxyProvider 对象（自动反序列化 labels JSON 字段） */
  private rowToProxyProvider(row: Record<string, unknown>): ProxyProvider {
    return {
      id: row.id as string,
      name: row.name as string,
      apiUrl: row.api_url as string,
      apiKey: row.api_key as string,
      protocol: row.protocol as ProxyProvider['protocol'],
      refreshInterval: row.refresh_interval as number,
      lastSync: row.last_sync as string | null,
      labels: fromJsonArray<string>(row.labels as JsonField),
      createdAt: row.created_at as string
    }
  }

  /** 行映射：数据库行 → AppLog 对象（自动反序列化 fields JSON 字段） */
  private rowToAppLog(row: Record<string, unknown>): AppLog {
    return {
      id: row.id as number,
      timestamp: row.timestamp as string,
      level: row.level as string,
      category: row.category as string,
      message: row.message as string,
      fields: fromJson(row.fields as JsonField)
    }
  }

  /**
   * 通用分页查询工具
   *
   * 封装 count + list 两条预编译语句的分页逻辑，自动计算 totalPages。
   *
   * @param countStmt - COUNT(*) 语句
   * @param listStmt  - LIMIT/OFFSET 查询语句
   * @param page      - 页码（从 1 开始）
   * @param pageSize  - 每页条数
   * @param mapper    - 行到实体的映射函数
   * @param searchParams - 可选的搜索参数数组（传给两条语句的前 N 个参数）
   * @returns 分页结果集
   */
  private paginate<T>(
    countStmt: Database.Statement,
    listStmt: Database.Statement,
    page: number,
    pageSize: number,
    mapper: (row: Record<string, unknown>) => T,
    searchParams?: unknown[]
  ): ListResponse<T> {
    const total = (
      (searchParams ? countStmt.get(...searchParams) : countStmt.get()) as Record<string, number>
    ).cnt
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const offset = (page - 1) * pageSize
    const rows = searchParams
      ? (listStmt.all(...searchParams, pageSize, offset) as Record<string, unknown>[])
      : (listStmt.all(pageSize, offset) as Record<string, unknown>[])
    return {
      items: rows.map(mapper),
      total,
      page,
      pageSize,
      totalPages
    }
  }

  /**
   * 创建账号
   *
   * @param data - 账号数据（无需提供 id/createdAt/updatedAt，自动生成）
   * @returns 创建的 Account 对象
   */
  createAccount(data: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>): Account {
    const id = uuidv4()
    const now = nowISO()
    this.stmt('account.insert').run(
      id,
      data.templateId,
      toJson(data.data),
      data.pool,
      toJson(data.labels),
      data.notes,
      now,
      now
    )
    return this.getAccount(id)!
  }

  /**
   * 根据 ID 获取账号
   *
   * @param id - 账号 UUID
   * @returns Account 对象，不存在时返回 null
   */
  getAccount(id: string): Account | null {
    const row = this.stmt('account.getById').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToAccount(row) : null
  }

  /**
   * 分页查询账号列表（支持按 pool 或 notes 模糊搜索）
   *
   * @param page     - 页码（默认 1）
   * @param pageSize - 每页条数（默认 20）
   * @param search   - 可选搜索关键词
   * @returns 分页结果
   */
  listAccounts(page = 1, pageSize = 20, search?: string): ListResponse<Account> {
    if (search) {
      const countStmt = this.db.prepare(
        'SELECT COUNT(*) as cnt FROM accounts WHERE pool LIKE ? OR notes LIKE ?'
      )
      const listStmt = this.db.prepare(
        'SELECT * FROM accounts WHERE pool LIKE ? OR notes LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
      )
      return this.paginate(countStmt, listStmt, page, pageSize, (r) => this.rowToAccount(r), [
        `%${search}%`,
        `%${search}%`
      ])
    }
    const countStmt = this.stmt('account.count')
    const listStmt = this.db.prepare(
      'SELECT * FROM accounts ORDER BY created_at DESC LIMIT ? OFFSET ?'
    )
    return this.paginate(countStmt, listStmt, page, pageSize, (r) => this.rowToAccount(r))
  }

  /**
   * 更新账号信息
   *
   * @param id   - 账号 UUID
   * @param data - 要更新的字段（部分更新）
   * @returns 更新后的 Account 对象，不存在时返回 null
   */
  updateAccount(
    id: string,
    data: Partial<Omit<Account, 'id' | 'createdAt' | 'updatedAt'>>
  ): Account | null {
    const existing = this.getAccount(id)
    if (!existing) return null
    const updated = { ...existing, ...data, updatedAt: nowISO() }
    this.stmt('account.update').run(
      updated.templateId,
      toJson(updated.data),
      updated.pool,
      toJson(updated.labels),
      updated.notes,
      updated.updatedAt,
      id
    )
    return this.getAccount(id)
  }

  /**
   * 删除账号
   *
   * @param id - 账号 UUID
   * @returns 是否成功删除
   */
  deleteAccount(id: string): boolean {
    const result = this.stmt('account.delete').run(id)
    return result.changes > 0
  }

  /**
   * 获取所有不重复的账号池名称
   *
   * @returns 账号池名称数组（已排序）
   */
  listAccountPools(): string[] {
    const rows = this.db
      .prepare(
        "SELECT DISTINCT pool FROM accounts WHERE pool IS NOT NULL AND pool != '' ORDER BY pool"
      )
      .all() as Array<{ pool: string }>
    return rows.map((r) => r.pool)
  }

  /**
   * 创建账户模板
   *
   * @param data - 模板数据（id 可选，不提供时自动生成 UUID）
   * @returns 创建的 Template 对象
   */
  createTemplate(data: Omit<Template, 'id' | 'updatedAt'> & { id?: string }): Template {
    const id = data.id ?? uuidv4()
    const updatedAt = nowISO()
    this.stmt('template.insert').run(
      id,
      data.type,
      data.name,
      toJson(data.schema),
      data.version,
      data.isLocal ? 1 : 0,
      updatedAt
    )
    return this.getTemplate(id)!
  }

  getTemplate(id: string): Template | null {
    const row = this.stmt('template.getById').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToTemplate(row) : null
  }

  listTemplates(page = 1, pageSize = 20, search?: string): ListResponse<Template> {
    if (search) {
      const countStmt = this.db.prepare(
        'SELECT COUNT(*) as cnt FROM templates WHERE name LIKE ? OR type LIKE ?'
      )
      const listStmt = this.db.prepare(
        'SELECT * FROM templates WHERE name LIKE ? OR type LIKE ? ORDER BY updated_at DESC LIMIT ? OFFSET ?'
      )
      return this.paginate(countStmt, listStmt, page, pageSize, (r) => this.rowToTemplate(r), [
        `%${search}%`,
        `%${search}%`
      ])
    }
    const countStmt = this.db.prepare('SELECT COUNT(*) as cnt FROM templates')
    const listStmt = this.db.prepare(
      'SELECT * FROM templates ORDER BY updated_at DESC LIMIT ? OFFSET ?'
    )
    return this.paginate(countStmt, listStmt, page, pageSize, (r) => this.rowToTemplate(r))
  }

  /**
   * 更新账户模板
   *
   * @param id   - 模板 UUID
   * @param data - 要更新的字段
   * @returns 更新后的 Template 对象，不存在时返回 null
   */
  updateTemplate(id: string, data: Partial<Omit<Template, 'id' | 'updatedAt'>>): Template | null {
    const existing = this.getTemplate(id)
    if (!existing) return null
    const updated = { ...existing, ...data, updatedAt: nowISO() }
    this.stmt('template.update').run(
      updated.type,
      updated.name,
      toJson(updated.schema),
      updated.version,
      updated.isLocal ? 1 : 0,
      updated.updatedAt,
      id
    )
    return this.getTemplate(id)
  }

  /**
   * 删除账户模板
   *
   * @param id - 模板 UUID
   * @returns 是否成功删除
   */
  deleteTemplate(id: string): boolean {
    const result = this.stmt('template.delete').run(id)
    return result.changes > 0
  }

  /**
   * 统计使用指定模板的账号数量
   *
   * @param templateId - 模板 UUID
   * @returns 账号数量
   */
  countAccountsByTemplate(templateId: string): number {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM accounts WHERE template_id = ?').get(templateId) as { cnt: number }
    return row.cnt
  }

  /**
   * 创建任务脚本模板
   *
   * @param data - 任务脚本模板数据（id 可选，不提供时自动生成 UUID）
   * @returns 创建的 TaskTemplate 对象
   */
  createTaskTemplate(data: Omit<TaskTemplate, 'id' | 'downloadedAt' | 'updatedAt'> & { id?: string }): TaskTemplate {
    const id = data.id ?? uuidv4()
    const now = nowISO()
    this.stmt('taskTemplate.insert').run(
      id,
      data.name,
      data.version,
      data.description,
      data.installPath,
      toJson(data.manifest),
      data.remoteUrl ?? null,
      data.isInstalled ? 1 : 0,
      now,
      now
    )
    return this.getTaskTemplate(id)!
  }

  /**
   * 根据 ID 获取任务脚本模板
   *
   * @param id - 任务脚本模板 UUID
   * @returns TaskTemplate 对象，不存在时返回 null
   */
  getTaskTemplate(id: string): TaskTemplate | null {
    const row = this.stmt('taskTemplate.getById').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToTaskTemplate(row) : null
  }

  /**
   * 分页查询任务脚本模板列表（支持按名称或描述模糊搜索）
   *
   * @param page     - 页码（默认 1）
   * @param pageSize - 每页条数（默认 20）
   * @param search   - 可选搜索关键词
   * @returns 分页结果
   */
  listTaskTemplates(page = 1, pageSize = 20, search?: string): ListResponse<TaskTemplate> {
    if (search) {
      const countStmt = this.db.prepare(
        'SELECT COUNT(*) as cnt FROM task_templates WHERE name LIKE ? OR description LIKE ?'
      )
      const listStmt = this.db.prepare(
        'SELECT * FROM task_templates WHERE name LIKE ? OR description LIKE ? ORDER BY updated_at DESC LIMIT ? OFFSET ?'
      )
      return this.paginate(countStmt, listStmt, page, pageSize, (r) => this.rowToTaskTemplate(r), [
        `%${search}%`,
        `%${search}%`
      ])
    }
    const countStmt = this.db.prepare('SELECT COUNT(*) as cnt FROM task_templates')
    const listStmt = this.db.prepare(
      'SELECT * FROM task_templates ORDER BY updated_at DESC LIMIT ? OFFSET ?'
    )
    return this.paginate(countStmt, listStmt, page, pageSize, (r) => this.rowToTaskTemplate(r))
  }

  /**
   * 更新任务脚本模板
   *
   * @param id   - 任务脚本模板 UUID
   * @param data - 要更新的字段
   * @returns 更新后的 TaskTemplate 对象，不存在时返回 null
   */
  updateTaskTemplate(
    id: string,
    data: Partial<Omit<TaskTemplate, 'id' | 'downloadedAt' | 'updatedAt'>>
  ): TaskTemplate | null {
    const existing = this.getTaskTemplate(id)
    if (!existing) return null
    const updated = { ...existing, ...data, updatedAt: nowISO() }
    this.stmt('taskTemplate.update').run(
      updated.name,
      updated.version,
      updated.description,
      updated.installPath,
      toJson(updated.manifest),
      updated.remoteUrl ?? null,
      updated.isInstalled ? 1 : 0,
      updated.downloadedAt,
      updated.updatedAt,
      id
    )
    return this.getTaskTemplate(id)
  }

  /**
   * 删除任务脚本模板
   *
   * @param id - 任务脚本模板 UUID
   * @returns 是否成功删除
   */
  deleteTaskTemplate(id: string): boolean {
    const result = this.stmt('taskTemplate.delete').run(id)
    return result.changes > 0
  }

  /**
   * 创建定时任务
   *
   * @param data - 定时任务数据
   * @returns 创建的 ScheduledTask 对象
   */
  createScheduledTask(data: Omit<ScheduledTask, 'id' | 'createdAt'>): ScheduledTask {
    const id = uuidv4()
    const createdAt = nowISO()
    this.stmt('scheduledTask.insert').run(
      id,
      data.templateId,
      toJson(data.config),
      data.cronExpression,
      data.enabled ? 1 : 0,
      data.lastRun ?? null,
      data.nextRun ?? null,
      createdAt
    )
    return this.getScheduledTask(id)!
  }

  /**
   * 根据 ID 获取定时任务
   *
   * @param id - 定时任务 UUID
   * @returns ScheduledTask 对象，不存在时返回 null
   */
  getScheduledTask(id: string): ScheduledTask | null {
    const row = this.stmt('scheduledTask.getById').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToScheduledTask(row) : null
  }

  /**
   * 分页查询定时任务列表（支持按 Cron 表达式模糊搜索）
   *
   * @param page     - 页码（默认 1）
   * @param pageSize - 每页条数（默认 20）
   * @param search   - 可选搜索关键词
   * @returns 分页结果
   */
  listScheduledTasks(page = 1, pageSize = 20, search?: string): ListResponse<ScheduledTask> {
    if (search) {
      const countStmt = this.db.prepare(
        'SELECT COUNT(*) as cnt FROM scheduled_tasks WHERE cron_expression LIKE ?'
      )
      const listStmt = this.db.prepare(
        'SELECT * FROM scheduled_tasks WHERE cron_expression LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
      )
      return this.paginate(countStmt, listStmt, page, pageSize, (r) => this.rowToScheduledTask(r), [
        `%${search}%`
      ])
    }
    const countStmt = this.db.prepare('SELECT COUNT(*) as cnt FROM scheduled_tasks')
    const listStmt = this.db.prepare(
      'SELECT * FROM scheduled_tasks ORDER BY created_at DESC LIMIT ? OFFSET ?'
    )
    return this.paginate(countStmt, listStmt, page, pageSize, (r) => this.rowToScheduledTask(r))
  }

  /**
   * 更新定时任务
   *
   * @param id   - 定时任务 UUID
   * @param data - 要更新的字段
   * @returns 更新后的 ScheduledTask 对象，不存在时返回 null
   */
  updateScheduledTask(
    id: string,
    data: Partial<Omit<ScheduledTask, 'id' | 'createdAt'>>
  ): ScheduledTask | null {
    const existing = this.getScheduledTask(id)
    if (!existing) return null
    const updated = { ...existing, ...data }
    this.stmt('scheduledTask.update').run(
      updated.templateId,
      toJson(updated.config),
      updated.cronExpression,
      updated.enabled ? 1 : 0,
      updated.lastRun ?? null,
      updated.nextRun ?? null,
      id
    )
    return this.getScheduledTask(id)
  }

  deleteScheduledTask(id: string): boolean {
    const result = this.stmt('scheduledTask.delete').run(id)
    return result.changes > 0
  }

  /**
   * 创建空投项目
   *
   * @param data - 空投项目数据（links/tasks/earnings/tags/labels 等 JSON 字段自动序列化）
   * @returns 创建的 AirdropProject 对象
   */
  createAirdrop(data: Omit<AirdropProject, 'id' | 'createdAt' | 'updatedAt'>): AirdropProject {
    const id = uuidv4()
    const now = nowISO()
    this.stmt('airdrop.insert').run(
      id,
      data.name,
      data.chain,
      data.status,
      data.projectType,
      data.description,
      data.website,
      data.scriptTemplateId ?? null,
      data.accountPool,
      toJson(data.links),
      toJson(data.eligibilityCriteria),
      toJson(data.tasks),
      toJson(data.earnings),
      toJson(data.tags),
      toJson(data.labels),
      now,
      now
    )
    return this.getAirdrop(id)!
  }

  /**
   * 根据 ID 获取空投项目
   *
   * @param id - 空投项目 UUID
   * @returns AirdropProject 对象，不存在时返回 null
   */
  getAirdrop(id: string): AirdropProject | null {
    const row = this.stmt('airdrop.getById').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToAirdropProject(row) : null
  }

  /**
   * 分页查询空投项目列表（支持按名称/描述/链模糊搜索）
   *
   * @param page     - 页码（默认 1）
   * @param pageSize - 每页条数（默认 20）
   * @param search   - 可选搜索关键词
   * @returns 分页结果
   */
  listAirdrops(page = 1, pageSize = 20, search?: string): ListResponse<AirdropProject> {
    if (search) {
      const countStmt = this.db.prepare(
        'SELECT COUNT(*) as cnt FROM airdrop_projects WHERE name LIKE ? OR chain LIKE ? OR description LIKE ?'
      )
      const listStmt = this.db.prepare(
        'SELECT * FROM airdrop_projects WHERE name LIKE ? OR chain LIKE ? OR description LIKE ? ORDER BY updated_at DESC LIMIT ? OFFSET ?'
      )
      return this.paginate(
        countStmt,
        listStmt,
        page,
        pageSize,
        (r) => this.rowToAirdropProject(r),
        [`%${search}%`, `%${search}%`, `%${search}%`]
      )
    }
    const countStmt = this.db.prepare('SELECT COUNT(*) as cnt FROM airdrop_projects')
    const listStmt = this.db.prepare(
      'SELECT * FROM airdrop_projects ORDER BY updated_at DESC LIMIT ? OFFSET ?'
    )
    return this.paginate(countStmt, listStmt, page, pageSize, (r) => this.rowToAirdropProject(r))
  }

  /**
   * 更新空投项目
   *
   * @param id   - 空投项目 UUID
   * @param data - 要更新的字段（links/tasks/earnings/tags/labels 自动序列化）
   * @returns 更新后的 AirdropProject 对象，不存在时返回 null
   */
  updateAirdrop(
    id: string,
    data: Partial<Omit<AirdropProject, 'id' | 'createdAt' | 'updatedAt'>>
  ): AirdropProject | null {
    const existing = this.getAirdrop(id)
    if (!existing) return null
    const updated = { ...existing, ...data, updatedAt: nowISO() }
    this.stmt('airdrop.update').run(
      updated.name,
      updated.chain,
      updated.status,
      updated.projectType,
      updated.description,
      updated.website,
      updated.scriptTemplateId ?? null,
      updated.accountPool,
      toJson(updated.links),
      toJson(updated.eligibilityCriteria),
      toJson(updated.tasks),
      toJson(updated.earnings),
      toJson(updated.tags),
      toJson(updated.labels),
      updated.updatedAt,
      id
    )
    return this.getAirdrop(id)
  }

  /**
   * 删除空投项目
   *
   * @param id - 空投项目 UUID
   * @returns 是否成功删除
   */
  deleteAirdrop(id: string): boolean {
    const result = this.stmt('airdrop.delete').run(id)
    return result.changes > 0
  }

  /**
   * 获取空投分析数据
   *
   * 统计各状态数量、总收益估算、代币分布和即将到期列表。
   *
   * @returns AirdropAnalytics 分析结果
   */
  getAirdropAnalytics(): AirdropAnalytics {
    const countByStatus = this.db
      .prepare('SELECT status, COUNT(*) as cnt FROM airdrop_projects GROUP BY status')
      .all() as Array<{ status: string; cnt: number }>
    const counts: Record<string, number> = {
      ongoing: 0,
      completed: 0,
      cancelled: 0,
      claimed: 0
    }
    let totalAirdrops = 0
    for (const row of countByStatus) {
      const cnt = Number(row.cnt) || 0
      totalAirdrops += cnt
      if (row.status in counts) counts[row.status] = cnt
    }

    const allRows = this.db
      .prepare('SELECT * FROM airdrop_projects')
      .all() as Array<Record<string, unknown>>

    let totalEarningsValueUsd = 0
    const tokenMap = new Map<string, { amount: number; valueUsd: number }>()
    const deadlineEntries: UpcomingDeadline[] = []

    for (const row of allRows) {
      const airdrop = this.rowToAirdropProject(row)
      const earnings = airdrop.earnings ?? []
      for (const e of earnings) {
        const v = Number(e.valueUsd) || 0
        totalEarningsValueUsd += v
        const token = (e.token ?? '').trim()
        if (token) {
          const prev = tokenMap.get(token) ?? { amount: 0, valueUsd: 0 }
          tokenMap.set(token, {
            amount: prev.amount + (Number(e.amount) || 0),
            valueUsd: prev.valueUsd + v
          })
        }
      }
      const tasks = airdrop.tasks ?? []
      for (const t of tasks) {
        if (t.deadline && t.deadline.trim().length > 0) {
          deadlineEntries.push({
            taskId: t.id,
            projectName: airdrop.name,
            taskTitle: t.title,
            deadline: t.deadline
          })
        }
      }
    }

    const tokenEarnings: TokenEarnings[] = Array.from(tokenMap.entries())
      .map(([token, v]) => ({ token, totalAmount: v.amount, totalValueUsd: v.valueUsd }))
      .sort((a, b) => {
        if (b.totalValueUsd !== a.totalValueUsd) return b.totalValueUsd - a.totalValueUsd
        return b.totalAmount - a.totalAmount
      })

    const upcomingDeadlines = deadlineEntries
      .sort((a, b) => a.deadline.localeCompare(b.deadline))
      .slice(0, 5)

    return {
      totalAirdrops,
      ongoingCount: counts.ongoing,
      completedCount: counts.completed,
      claimedCount: counts.claimed,
      cancelledCount: counts.cancelled,
      totalEarningsValueUsd,
      tokenEarnings,
      upcomingDeadlines
    }
  }

  /**
   * 创建验证码 API 密钥记录
   *
   * @param data - 验证码密钥数据
   * @returns 创建的 CaptchaKey 对象
   */
  createCaptchaKey(data: Omit<CaptchaKey, 'id' | 'createdAt'>): CaptchaKey {
    const id = uuidv4()
    const createdAt = nowISO()
    this.stmt('captchaKey.insert').run(id, data.provider, data.apiKey, data.balance, createdAt)
    return this.getCaptchaKey(id)!
  }

  /**
   * 根据 ID 获取验证码密钥
   *
   * @param id - 验证码密钥 UUID
   * @returns CaptchaKey 对象，不存在时返回 null
   */
  getCaptchaKey(id: string): CaptchaKey | null {
    const row = this.stmt('captchaKey.getById').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToCaptchaKey(row) : null
  }

  /**
   * 分页查询验证码密钥列表（支持按提供商名称模糊搜索）
   *
   * @param page     - 页码（默认 1）
   * @param pageSize - 每页条数（默认 20）
   * @param search   - 可选搜索关键词
   * @returns 分页结果
   */
  listCaptchaKeys(page = 1, pageSize = 20, search?: string): ListResponse<CaptchaKey> {
    if (search) {
      const countStmt = this.db.prepare(
        'SELECT COUNT(*) as cnt FROM captcha_keys WHERE provider LIKE ?'
      )
      const listStmt = this.db.prepare(
        'SELECT * FROM captcha_keys WHERE provider LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
      )
      return this.paginate(countStmt, listStmt, page, pageSize, (r) => this.rowToCaptchaKey(r), [
        `%${search}%`
      ])
    }
    const countStmt = this.db.prepare('SELECT COUNT(*) as cnt FROM captcha_keys')
    const listStmt = this.db.prepare(
      'SELECT * FROM captcha_keys ORDER BY created_at DESC LIMIT ? OFFSET ?'
    )
    return this.paginate(countStmt, listStmt, page, pageSize, (r) => this.rowToCaptchaKey(r))
  }

  /**
   * 更新验证码密钥信息
   *
   * @param id   - 验证码密钥 UUID
   * @param data - 要更新的字段
   * @returns 更新后的 CaptchaKey 对象，不存在时返回 null
   */
  updateCaptchaKey(
    id: string,
    data: Partial<Omit<CaptchaKey, 'id' | 'createdAt'>>
  ): CaptchaKey | null {
    const existing = this.getCaptchaKey(id)
    if (!existing) return null
    const updated = { ...existing, ...data }
    this.stmt('captchaKey.update').run(updated.provider, updated.apiKey, updated.balance, id)
    return this.getCaptchaKey(id)
  }

  /**
   * 删除验证码密钥
   *
   * @param id - 验证码密钥 UUID
   * @returns 是否成功删除
   */
  deleteCaptchaKey(id: string): boolean {
    const result = this.stmt('captchaKey.delete').run(id)
    return result.changes > 0
  }

  /**
   * 创建代理提供商配置
   *
   * @param data - 代理提供商数据
   * @returns 创建的 ProxyProvider 对象
   */
  createProxyProvider(data: Omit<ProxyProvider, 'id' | 'createdAt'>): ProxyProvider {
    const id = uuidv4()
    const createdAt = nowISO()
    this.stmt('proxyProvider.insert').run(
      id,
      data.name,
      data.apiUrl,
      data.apiKey,
      data.protocol,
      data.refreshInterval,
      data.lastSync ?? null,
      toJson(data.labels),
      createdAt
    )
    return this.getProxyProvider(id)!
  }

  /**
   * 根据 ID 获取代理提供商
   *
   * @param id - 代理提供商 UUID
   * @returns ProxyProvider 对象，不存在时返回 null
   */
  getProxyProvider(id: string): ProxyProvider | null {
    const row = this.stmt('proxyProvider.getById').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToProxyProvider(row) : null
  }

  /**
   * 分页查询代理提供商列表（支持按名称或 API URL 模糊搜索）
   *
   * @param page     - 页码（默认 1）
   * @param pageSize - 每页条数（默认 20）
   * @param search   - 可选搜索关键词
   * @returns 分页结果
   */
  listProxyProviders(page = 1, pageSize = 20, search?: string): ListResponse<ProxyProvider> {
    if (search) {
      const countStmt = this.db.prepare(
        'SELECT COUNT(*) as cnt FROM proxy_providers WHERE name LIKE ? OR api_url LIKE ?'
      )
      const listStmt = this.db.prepare(
        'SELECT * FROM proxy_providers WHERE name LIKE ? OR api_url LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
      )
      return this.paginate(countStmt, listStmt, page, pageSize, (r) => this.rowToProxyProvider(r), [
        `%${search}%`,
        `%${search}%`
      ])
    }
    const countStmt = this.db.prepare('SELECT COUNT(*) as cnt FROM proxy_providers')
    const listStmt = this.db.prepare(
      'SELECT * FROM proxy_providers ORDER BY created_at DESC LIMIT ? OFFSET ?'
    )
    return this.paginate(countStmt, listStmt, page, pageSize, (r) => this.rowToProxyProvider(r))
  }

  /**
   * 更新代理提供商配置
   *
   * @param id   - 代理提供商 UUID
   * @param data - 要更新的字段
   * @returns 更新后的 ProxyProvider 对象，不存在时返回 null
   */
  updateProxyProvider(
    id: string,
    data: Partial<Omit<ProxyProvider, 'id' | 'createdAt'>>
  ): ProxyProvider | null {
    const existing = this.getProxyProvider(id)
    if (!existing) return null
    const updated = { ...existing, ...data }
    this.stmt('proxyProvider.update').run(
      updated.name,
      updated.apiUrl,
      updated.apiKey,
      updated.protocol,
      updated.refreshInterval,
      updated.lastSync ?? null,
      toJson(updated.labels),
      id
    )
    return this.getProxyProvider(id)
  }

  /**
   * 删除代理提供商
   *
   * @param id - 代理提供商 UUID
   * @returns 是否成功删除
   */
  deleteProxyProvider(id: string): boolean {
    const result = this.stmt('proxyProvider.delete').run(id)
    return result.changes > 0
  }

  /**
   * 添加应用日志
   *
   * @param level    - 日志级别（info / warn / error / debug）
   * @param category - 日志分类
   * @param message  - 日志内容
   * @param fields   - 可选的附加字段（自动序列化为 JSON）
   */
  addAppLog(level: string, category: string, message: string, fields?: unknown): void {
    this.stmt('appLog.insert').run(nowISO(), level, category, message, toJson(fields))
  }

  /**
   * 分页查询应用日志（支持按分类或内容模糊搜索）
   *
   * @param page     - 页码（默认 1）
   * @param pageSize - 每页条数（默认 20）
   * @param search   - 可选搜索关键词
   * @returns 分页结果
   */
  listAppLogs(page = 1, pageSize = 20, search?: string): ListResponse<AppLog> {
    if (search) {
      const countStmt = this.db.prepare(
        'SELECT COUNT(*) as cnt FROM app_logs WHERE category LIKE ? OR message LIKE ?'
      )
      const listStmt = this.db.prepare(
        'SELECT * FROM app_logs WHERE category LIKE ? OR message LIKE ? ORDER BY id DESC LIMIT ? OFFSET ?'
      )
      return this.paginate(countStmt, listStmt, page, pageSize, (r) => this.rowToAppLog(r), [
        `%${search}%`,
        `%${search}%`
      ])
    }
    const countStmt = this.db.prepare('SELECT COUNT(*) as cnt FROM app_logs')
    const listStmt = this.db.prepare('SELECT * FROM app_logs ORDER BY id DESC LIMIT ? OFFSET ?')
    return this.paginate(countStmt, listStmt, page, pageSize, (r) => this.rowToAppLog(r))
  }

  /**
   * 获取设置项的值
   *
   * @param key - 设置键名
   * @returns 设置值，不存在时返回 null
   */
  getSetting(key: string): string | null {
    const row = this.stmt('setting.get').get(key) as Record<string, string> | undefined
    return row ? row.value : null
  }

  /**
   * 设置键值对（INSERT OR REPLACE）
   *
   * @param key   - 设置键名
   * @param value - 设置值
   */
  setSetting(key: string, value: string): void {
    this.stmt('setting.set').run(key, value)
  }

  /**
   * 获取所有设置项
   *
   * @returns 键值对对象
   */
  getAllSettings(): Record<string, string> {
    const rows = this.stmt('setting.getAll').all() as Record<string, string>[]
    const result: Record<string, string> = {}
    for (const row of rows) {
      result[row.key] = row.value
    }
    return result
  }

  /**
   * 删除设置项
   *
   * @param key - 设置键名
   * @returns 是否成功删除
   */
  deleteSetting(key: string): boolean {
    const result = this.stmt('setting.delete').run(key)
    return result.changes > 0
  }

  /**
   * 获取仪表盘聚合统计数据
   *
   * 统计钱包总数/链分布、代理总数/协议分布/状态分布、账号池分布、
   * 任务总数/状态分布/成功率、空投项目统计和即将到期列表。
   *
   * @returns 完整的 StatsAggregate 统计聚合
   */
  getStats(): StatsAggregate {
    const walletTotal = this._walletRepo.count()
    const walletChainDistribution = this._walletRepo.countByType()

    const proxyTotal = this._proxyRepo.count()
    const proxyProtocolDistribution = this._proxyRepo.countByProtocol()
    const proxyStatusDistribution = this._proxyRepo.countByStatus()

    const accountTotal = (this.stmt('account.count').get() as Record<string, number>).cnt
    const accountPoolRows = this.stmt('account.countByPool').all() as Record<string, unknown>[]
    const accountPoolDistribution: Record<string, number> = {}
    for (const row of accountPoolRows) {
      accountPoolDistribution[row.pool as string] = row.cnt as number
    }

    const taskTotal = this._taskRepo.count()
    const taskStatusDistribution = this._taskRepo.countByStatus()

    const taskCompletedCount = taskStatusDistribution['complete'] ?? 0
    const taskErrorCount = taskStatusDistribution['error'] ?? 0
    const totalFinishedTasks = taskCompletedCount + taskErrorCount
    const taskSuccessRate = totalFinishedTasks > 0 ? taskCompletedCount / totalFinishedTasks : null

    const durationRow = this.db
      .prepare(
        "SELECT AVG((julianday(ended_at) - julianday(started_at)) * 86400) as avg_dur FROM tasks WHERE status IN ('complete','error','stopped') AND started_at IS NOT NULL AND ended_at IS NOT NULL"
      )
      .get() as Record<string, number | null>
    const averageTaskDurationSecs =
      durationRow.avg_dur !== null ? Math.round(durationRow.avg_dur * 100) / 100 : null

    const durDistRows = this.db
      .prepare(
        "SELECT CASE WHEN (julianday(ended_at) - julianday(started_at)) * 86400 < 60 THEN '<1min' WHEN (julianday(ended_at) - julianday(started_at)) * 86400 < 300 THEN '1-5min' WHEN (julianday(ended_at) - julianday(started_at)) * 86400 < 600 THEN '5-10min' WHEN (julianday(ended_at) - julianday(started_at)) * 86400 < 1800 THEN '10-30min' ELSE '>30min' END as bucket, COUNT(*) as cnt FROM tasks WHERE status IN ('complete','error','stopped') AND started_at IS NOT NULL AND ended_at IS NOT NULL GROUP BY bucket"
      )
      .all() as Record<string, unknown>[]
    const taskDurationDistribution: Record<string, number> = {}
    for (const row of durDistRows) {
      taskDurationDistribution[row.bucket as string] = row.cnt as number
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
    const taskTimeline = this._taskRepo.getTimeline(thirtyDaysAgo)

    const recentTaskResults = this._taskRepo.getRecentFinished(10)

    const templateUsageRows = this.db
      .prepare(
        'SELECT tt.name as template_name, COUNT(tk.id) as task_count FROM task_templates tt LEFT JOIN tasks tk ON tk.script_folder = tt.install_path GROUP BY tt.id ORDER BY task_count DESC'
      )
      .all() as Record<string, unknown>[]
    const templateUsage: TemplateUsage[] = templateUsageRows.map((row) => ({
      templateName: row.template_name as string,
      taskCount: row.task_count as number
    }))

    const templateRankingRows = this.db
      .prepare(
        "SELECT tt.name as template_name, COUNT(tk.id) as task_count, SUM(CASE WHEN tk.status='complete' THEN 1 ELSE 0 END) as success_count, SUM(CASE WHEN tk.status='error' THEN 1 ELSE 0 END) as error_count FROM task_templates tt LEFT JOIN tasks tk ON tk.script_folder = tt.install_path GROUP BY tt.id ORDER BY task_count DESC"
      )
      .all() as Record<string, unknown>[]
    const templateRanking: TemplateRanking[] = templateRankingRows.map((row) => {
      const tc = row.task_count as number
      const sc = (row.success_count as number) ?? 0
      const ec = (row.error_count as number) ?? 0
      return {
        templateName: row.template_name as string,
        taskCount: tc,
        successCount: sc,
        errorCount: ec,
        successRate: tc > 0 ? Math.round((sc / tc) * 10000) / 10000 : null
      }
    })

    const eightWeeksAgo = new Date(Date.now() - 56 * 86400000).toISOString()
    const weeklyTrend = this._taskRepo.getWeeklyTrend(eightWeeksAgo)

    const totalLogs = this._taskRepo.countTaskLogs()

    return {
      walletTotal,
      walletChainDistribution,
      proxyTotal,
      proxyProtocolDistribution,
      proxyStatusDistribution,
      accountTotal,
      accountPoolDistribution,
      taskTotal,
      taskStatusDistribution,
      taskSuccessRate,
      taskCompletedCount,
      taskErrorCount,
      totalFinishedTasks,
      averageTaskDurationSecs,
      taskDurationDistribution,
      taskTimeline,
      recentTaskResults,
      templateUsage,
      templateRanking,
      weeklyTrend,
      totalLogs
    }
  }

  /**
   * 获取应用信息（用于 Debug 页面展示）
   *
   * 包含数据库连接状态、各实体数量、运行中任务数等诊断信息。
   *
   * @param version - 应用版本号
   * @param dataDir - 数据目录路径
   * @returns AppInfo 诊断信息
   */
  getAppInfo(version = '', dataDir = ''): AppInfo {
    let dbConnected = true
    let dbError: string | null = null
    try {
      this.db.prepare('SELECT 1').get()
    } catch (e) {
      dbConnected = false
      dbError = (e as Error).message
    }

    const walletCount = this._walletRepo.count()
    const accountCount = (this.stmt('account.count').get() as Record<string, number>).cnt
    const proxyCount = this._proxyRepo.count()
    const taskCount = this._taskRepo.count()

    const runningRow = this.db
      .prepare("SELECT COUNT(*) as cnt FROM tasks WHERE status = 'running'")
      .get() as Record<string, number>
    const runningTaskCount = runningRow.cnt

    return {
      version,
      dataDir,
      dbConnected,
      dbError,
      walletCount,
      accountCount,
      proxyCount,
      taskCount,
      runningTaskCount,
      totalLogs: 0
    }
  }

  /**
   * 批量创建账号（事务内执行，提升导入性能）
   *
   * @param items - 账号数据数组
   * @returns 成功创建的账号数量
   */
  batchCreateAccounts(items: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>[]): number {
    const insert = this.stmt('account.insert')
    const transaction = this.db.transaction(
      (data: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>[]) => {
        let count = 0
        for (const item of data) {
          const id = uuidv4()
          const now = nowISO()
          insert.run(
            id,
            item.templateId,
            toJson(item.data),
            item.pool,
            toJson(item.labels),
            item.notes,
            now,
            now
          )
          count++
        }
        return count
      }
    )
    return transaction(items)
  }

  /**
   * 高级日志查询（支持按级别、分类、关键词、时间范围过滤）
   *
   * @param level    - 可选的日志级别过滤
   * @param category - 可选的日志分类过滤
   * @param search   - 可选的关键词模糊搜索
   * @param since    - 可选的起始时间（ISO 8601）
   * @param until    - 可选的结束时间（ISO 8601）
   * @param limit    - 返回条数上限（默认 100）
   * @returns 过滤后的日志分页结果
   */
  queryLogs(
    level?: string,
    category?: string,
    search?: string,
    since?: string,
    until?: string,
    limit = 100
  ): ListResponse<AppLog> {
    const conditions: string[] = []
    const params: unknown[] = []

    if (level) {
      conditions.push('level = ?')
      params.push(level)
    }
    if (category) {
      conditions.push('category = ?')
      params.push(category)
    }
    if (search) {
      conditions.push('message LIKE ?')
      params.push(`%${search}%`)
    }
    if (since) {
      conditions.push('timestamp >= ?')
      params.push(since)
    }
    if (until) {
      conditions.push('timestamp <= ?')
      params.push(until)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const countRow = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM app_logs ${where}`)
      .get(...params) as Record<string, number>
    const total = countRow.cnt
    const rows = this.db
      .prepare(`SELECT * FROM app_logs ${where} ORDER BY id DESC LIMIT ?`)
      .all(...params, limit) as Record<string, unknown>[]
    return {
      items: rows.map((r) => this.rowToAppLog(r)),
      total,
      page: 1,
      pageSize: limit,
      totalPages: Math.max(1, Math.ceil(total / limit))
    }
  }

  /**
   * 获取所有不重复的日志分类名称
   *
   * @returns 分类名称数组（已排序）
   */
  getLogCategories(): string[] {
    const rows = this.db
      .prepare('SELECT DISTINCT category FROM app_logs ORDER BY category')
      .all() as Record<string, string>[]
    return rows.map((r) => r.category)
  }

  /**
   * 设置日志级别（持久化到 settings 表）
   *
   * @param level - 日志级别名称
   */
  setLogLevel(level: string): void {
    this.setSetting('logLevel', level)
  }

  /**
   * 获取当前日志级别
   *
   * @returns 日志级别（默认 'info'）
   */
  getLogLevel(): string {
    return this.getSetting('logLevel') ?? 'info'
  }

  /** 删除所有应用日志（用于日志清理） */
  deleteAllLogs(): number {
    const result = this.db.prepare('DELETE FROM app_logs').run()
    return result.changes
  }

  /** 关闭数据库连接（应用退出时调用） */
  close(): void {
    this.db.close()
  }

  /** 获取原始 better-sqlite3 数据库实例（供子仓库和其他内部使用） */
  getDb(): Database.Database {
    return this.db
  }
}

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

type JsonField = string | null

function toJson(val: unknown): JsonField {
  if (val === undefined || val === null) return null
  return JSON.stringify(val)
}

function fromJson<T>(val: JsonField): T | null {
  if (val === null) return null
  try {
    return JSON.parse(val) as T
  } catch {
    return null
  }
}

function fromJsonArray<T>(val: JsonField): T[] {
  if (val === null) return []
  try {
    return JSON.parse(val) as T[]
  } catch {
    return []
  }
}

function nowISO(): string {
  return new Date().toISOString()
}

export class StoreService {
  private db: Database.Database
  private stmts: Map<string, Database.Statement>
  private _walletRepo: WalletRepository
  private _proxyRepo: ProxyRepository
  private _taskRepo: TaskRepository

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

  get walletRepo(): WalletRepository {
    return this._walletRepo
  }

  get proxyRepo(): ProxyRepository {
    return this._proxyRepo
  }

  get taskRepo(): TaskRepository {
    return this._taskRepo
  }

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

  private migrateProxies(): void {
    const cols = this.db.prepare("PRAGMA table_info('proxies')").all() as Array<{ name: string }>
    const names = new Set(cols.map((c) => c.name))
    if (!names.has('format')) {
      this.db.exec("ALTER TABLE proxies ADD COLUMN format TEXT NOT NULL DEFAULT 'manual'")
    }
  }

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

  private stmt(name: string): Database.Statement {
    const s = this.stmts.get(name)
    if (!s) throw new Error(`Prepared statement not found: ${name}`)
    return s
  }

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

  private rowToCaptchaKey(row: Record<string, unknown>): CaptchaKey {
    return {
      id: row.id as string,
      provider: row.provider as string,
      apiKey: row.api_key as string,
      balance: row.balance as number,
      createdAt: row.created_at as string
    }
  }

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

  getAccount(id: string): Account | null {
    const row = this.stmt('account.getById').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToAccount(row) : null
  }

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

  deleteAccount(id: string): boolean {
    const result = this.stmt('account.delete').run(id)
    return result.changes > 0
  }

  listAccountPools(): string[] {
    const rows = this.db
      .prepare(
        "SELECT DISTINCT pool FROM accounts WHERE pool IS NOT NULL AND pool != '' ORDER BY pool"
      )
      .all() as Array<{ pool: string }>
    return rows.map((r) => r.pool)
  }

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

  deleteTemplate(id: string): boolean {
    const result = this.stmt('template.delete').run(id)
    return result.changes > 0
  }

  countAccountsByTemplate(templateId: string): number {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM accounts WHERE template_id = ?').get(templateId) as { cnt: number }
    return row.cnt
  }

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

  getTaskTemplate(id: string): TaskTemplate | null {
    const row = this.stmt('taskTemplate.getById').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToTaskTemplate(row) : null
  }

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

  deleteTaskTemplate(id: string): boolean {
    const result = this.stmt('taskTemplate.delete').run(id)
    return result.changes > 0
  }

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

  getScheduledTask(id: string): ScheduledTask | null {
    const row = this.stmt('scheduledTask.getById').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToScheduledTask(row) : null
  }

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

  getAirdrop(id: string): AirdropProject | null {
    const row = this.stmt('airdrop.getById').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToAirdropProject(row) : null
  }

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

  deleteAirdrop(id: string): boolean {
    const result = this.stmt('airdrop.delete').run(id)
    return result.changes > 0
  }

  createCaptchaKey(data: Omit<CaptchaKey, 'id' | 'createdAt'>): CaptchaKey {
    const id = uuidv4()
    const createdAt = nowISO()
    this.stmt('captchaKey.insert').run(id, data.provider, data.apiKey, data.balance, createdAt)
    return this.getCaptchaKey(id)!
  }

  getCaptchaKey(id: string): CaptchaKey | null {
    const row = this.stmt('captchaKey.getById').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToCaptchaKey(row) : null
  }

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

  deleteCaptchaKey(id: string): boolean {
    const result = this.stmt('captchaKey.delete').run(id)
    return result.changes > 0
  }

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

  getProxyProvider(id: string): ProxyProvider | null {
    const row = this.stmt('proxyProvider.getById').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToProxyProvider(row) : null
  }

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

  deleteProxyProvider(id: string): boolean {
    const result = this.stmt('proxyProvider.delete').run(id)
    return result.changes > 0
  }

  addAppLog(level: string, category: string, message: string, fields?: unknown): void {
    this.stmt('appLog.insert').run(nowISO(), level, category, message, toJson(fields))
  }

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

  getSetting(key: string): string | null {
    const row = this.stmt('setting.get').get(key) as Record<string, string> | undefined
    return row ? row.value : null
  }

  setSetting(key: string, value: string): void {
    this.stmt('setting.set').run(key, value)
  }

  getAllSettings(): Record<string, string> {
    const rows = this.stmt('setting.getAll').all() as Record<string, string>[]
    const result: Record<string, string> = {}
    for (const row of rows) {
      result[row.key] = row.value
    }
    return result
  }

  deleteSetting(key: string): boolean {
    const result = this.stmt('setting.delete').run(key)
    return result.changes > 0
  }

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
      runningTaskCount
    }
  }

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

  getLogCategories(): string[] {
    const rows = this.db
      .prepare('SELECT DISTINCT category FROM app_logs ORDER BY category')
      .all() as Record<string, string>[]
    return rows.map((r) => r.category)
  }

  setLogLevel(level: string): void {
    this.setSetting('logLevel', level)
  }

  getLogLevel(): string {
    return this.getSetting('logLevel') ?? 'info'
  }

  deleteAllLogs(): number {
    const result = this.db.prepare('DELETE FROM app_logs').run()
    return result.changes
  }

  close(): void {
    this.db.close()
  }

  getDb(): Database.Database {
    return this.db
  }
}

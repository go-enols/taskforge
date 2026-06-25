/**
 * @file StoreService — SQLite 数据访问层（核心持久层）
 * @description 封装所有数据表的 CRUD 操作，采用 better-sqlite3 同步 API，
 *              所有实体 CRUD 委托给对应的 Repository 子仓库处理。
 *              提供向后兼容的方法签名供 IPC handler 调用。
 * @module main/services
 */

import Database from 'better-sqlite3'
import type {
  Wallet,
  ScriptParam,
  Proxy,
  Task,
  TaskLog,
  Template,
  TaskTemplate,
  ScheduledTask,
  AirdropProject,
  AirdropAnalytics,
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
  WeeklyTrend,
  ProjectTemplate
} from '../../shared/types'
import {
  WalletRepository,
  ProxyRepository,
  TaskRepository,
  ScriptParamRepository,
  TemplateRepository,
  TaskTemplateRepository,
  ScheduledTaskRepository,
  AirdropProjectRepository,
  CaptchaKeyRepository,
  ProxyProviderRepository,
  AppLogRepository,
  SettingsRepository,
  ProjectTemplateRepository
} from './repositories'
import { Logger } from '../utils/logger'

export type {
  Wallet,
  ScriptParam,
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
 * - 提供每个实体类型的完整 CRUD + 分页搜索（通过子仓库委托）
 * - 聚合/统计查询（Dashboard 数据）
 * - 委托子仓库处理特定逻辑（钱包、代理、任务等）
 *
 * @example
 * ```ts
 * const store = new StoreService('path/to/taskforge.db')
 * const wallets = store.walletRepo.listWallets()
 * const scriptParams = store.listScriptParams(1, 20, 'search term')
 * ```
 */
export class StoreService {
  /** SQLite 数据库连接实例 */
  private db: Database.Database
  /** 钱包子仓库 */
  private _walletRepo: WalletRepository
  /** 代理子仓库 */
  private _proxyRepo: ProxyRepository
  /** 任务子仓库 */
  private _taskRepo: TaskRepository
  /** 脚本参数子仓库 */
  private _scriptParamRepo: ScriptParamRepository
  /** 账户模板子仓库 */
  private _templateRepo: TemplateRepository
  /** 任务脚本模板子仓库 */
  private _taskTemplateRepo: TaskTemplateRepository
  /** 定时任务子仓库 */
  private _scheduledTaskRepo: ScheduledTaskRepository
  /** 空投项目子仓库 */
  private _airdropRepo: AirdropProjectRepository
  /** 验证码密钥子仓库 */
  private _captchaKeyRepo: CaptchaKeyRepository
  /** 代理提供商子仓库 */
  private _proxyProviderRepo: ProxyProviderRepository
  /** 应用日志子仓库 */
  private _appLogRepo: AppLogRepository
  /** 设置子仓库 */
  private _settingsRepo: SettingsRepository
  /** 项目模板子仓库 */
  private _projectTemplateRepo: ProjectTemplateRepository

  /**
   * @param dbPath - SQLite 数据库文件路径
   * @param encryption - 可选的加密服务实例，用于钱包私钥加密存储
   */
  constructor(dbPath: string, encryption?: import('./encryption').EncryptionService) {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.initialize()
    this._walletRepo = new WalletRepository(this.db, encryption)
    this._proxyRepo = new ProxyRepository(this.db)
    this._taskRepo = new TaskRepository(this.db)
    this._scriptParamRepo = new ScriptParamRepository(this.db)
    this._templateRepo = new TemplateRepository(this.db)
    this._taskTemplateRepo = new TaskTemplateRepository(this.db)
    this._scheduledTaskRepo = new ScheduledTaskRepository(this.db)
    this._airdropRepo = new AirdropProjectRepository(this.db)
    this._captchaKeyRepo = new CaptchaKeyRepository(this.db)
    this._proxyProviderRepo = new ProxyProviderRepository(this.db)
    this._appLogRepo = new AppLogRepository(this.db)
    this._settingsRepo = new SettingsRepository(this.db)
    this._projectTemplateRepo = new ProjectTemplateRepository(this.db)
    this.seedProjectTemplates()
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

  /** 获取脚本参数子仓库 */
  get scriptParamRepo(): ScriptParamRepository {
    return this._scriptParamRepo
  }

  /** 获取账户模板子仓库 */
  get templateRepo(): TemplateRepository {
    return this._templateRepo
  }

  /** 获取任务脚本模板子仓库 */
  get taskTemplateRepo(): TaskTemplateRepository {
    return this._taskTemplateRepo
  }

  /** 获取定时任务子仓库 */
  get scheduledTaskRepo(): ScheduledTaskRepository {
    return this._scheduledTaskRepo
  }

  /** 获取空投项目子仓库 */
  get airdropRepo(): AirdropProjectRepository {
    return this._airdropRepo
  }

  /** 获取验证码密钥子仓库 */
  get captchaKeyRepo(): CaptchaKeyRepository {
    return this._captchaKeyRepo
  }

  /** 获取代理提供商子仓库 */
  get proxyProviderRepo(): ProxyProviderRepository {
    return this._proxyProviderRepo
  }

  /** 获取应用日志子仓库 */
  get appLogRepo(): AppLogRepository {
    return this._appLogRepo
  }

  /** 获取设置子仓库 */
  get settingsRepo(): SettingsRepository {
    return this._settingsRepo
  }

  /** 获取项目模板子仓库 */
  get projectTemplateRepo(): ProjectTemplateRepository {
    return this._projectTemplateRepo
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

      CREATE TABLE IF NOT EXISTS script_params (
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
        template_id TEXT,
        custom_fields TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
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

      CREATE TABLE IF NOT EXISTS project_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        icon TEXT NOT NULL DEFAULT 'Folder',
        fields TEXT NOT NULL DEFAULT '[]',
        built_in INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 100,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_task_logs_task_id ON task_logs(task_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_wallets_wallet_type ON wallets(wallet_type);
      CREATE INDEX IF NOT EXISTS idx_proxies_status ON proxies(status);
      CREATE INDEX IF NOT EXISTS idx_script_params_pool ON script_params(pool);
      CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_enabled ON scheduled_tasks(enabled);
      CREATE INDEX IF NOT EXISTS idx_airdrop_projects_status ON airdrop_projects(status);
      CREATE INDEX IF NOT EXISTS idx_app_logs_category ON app_logs(category);
    `)

    this.migrateAccountsToScriptParams()
    this.migrateAirdropProjects()
    this.migrateProxies()
  }

  /**
   * 迁移：把老表 accounts 重命名为 script_params（重命名后保留 account_pool 字段名兼容历史数据）。
   * 仅当老表存在且新表不存在时执行（首次升级场景）；新装用户由 CREATE TABLE IF NOT EXISTS 处理。
   */
  private migrateAccountsToScriptParams(): void {
    const tables = this.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('accounts', 'script_params')"
      )
      .all() as Array<{ name: string }>
    const hasOld = tables.some((t) => t.name === 'accounts')
    const hasNew = tables.some((t) => t.name === 'script_params')
    if (hasOld && !hasNew) {
      this.db.exec('ALTER TABLE accounts RENAME TO script_params')
    }
    const oldIdx = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_accounts_pool'")
      .get() as { name: string } | undefined
    if (oldIdx) {
      this.db.exec('DROP INDEX IF EXISTS idx_accounts_pool')
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_script_params_pool ON script_params(pool)')
    }
  }

  /** 迁移：为 airdrop_projects 表添加后续新增的字段 */
  private migrateAirdropProjects(): void {
    const cols = this.db.prepare("PRAGMA table_info('airdrop_projects')").all() as Array<{
      name: string
    }>
    const names = new Set(cols.map((c) => c.name))
    const migrations: Record<string, string> = {
      website: "ALTER TABLE airdrop_projects ADD COLUMN website TEXT NOT NULL DEFAULT ''",
      script_template_id: 'ALTER TABLE airdrop_projects ADD COLUMN script_template_id TEXT',
      account_pool: "ALTER TABLE airdrop_projects ADD COLUMN account_pool TEXT NOT NULL DEFAULT ''",
      template_id: 'ALTER TABLE airdrop_projects ADD COLUMN template_id TEXT',
      custom_fields: "ALTER TABLE airdrop_projects ADD COLUMN custom_fields TEXT NOT NULL DEFAULT '{}'"
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

  /**
   * 种子：首次启动时插入 2 个内置项目模板
   * 用 INSERT OR IGNORE 防重复 — 用户已存在同 id 模板则不覆盖
   */
  private seedProjectTemplates(): void {
    const now = nowISO()
    const builtIns: Array<Omit<ProjectTemplate, 'createdAt' | 'updatedAt'>> = [
      {
        id: 'built-in:basic-project',
        name: '基础项目',
        description: '最简单的项目模板, 包含项目名称、官网、描述 (基础信息已有, 无需额外字段)',
        icon: 'Folder',
        fields: [],
        builtIn: true,
        enabled: true,
        sortOrder: 10
      },
      {
        id: 'built-in:tracked-project',
        name: '可追踪项目',
        description: '适合需要跟踪进度的项目, 额外字段: 目标 / 截止日期 / 优先级 / 状态备注',
        icon: 'Target',
        fields: [
          {
            name: 'goal',
            title: '目标',
            type: 'string',
            placeholder: '例如: 1000 真实用户 / 10 万美元融资 / ...',
            description: '本项目要达成的核心目标'
          },
          {
            name: 'priority',
            title: '优先级',
            type: 'select',
            default: 'medium',
            options: [
              { label: '高', value: 'high' },
              { label: '中', value: 'medium' },
              { label: '低', value: 'low' }
            ]
          },
          {
            name: 'deadline',
            title: '截止日期',
            type: 'string',
            placeholder: 'YYYY-MM-DD 或留空'
          },
          {
            name: 'progress',
            title: '进度 (0-100)',
            type: 'number',
            default: 0
          }
        ],
        builtIn: true,
        enabled: true,
        sortOrder: 20
      }
    ]

    const existsStmt = this.db.prepare('SELECT 1 FROM project_templates WHERE id = ?')
    const insertStmt = this.db.prepare(
      'INSERT INTO project_templates (id, name, description, icon, fields, built_in, enabled, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    for (const t of builtIns) {
      const existing = existsStmt.get(t.id)
      if (existing) continue
      insertStmt.run(
        t.id,
        t.name,
        t.description,
        t.icon,
        toJson(t.fields),
        t.builtIn ? 1 : 0,
        t.enabled ? 1 : 0,
        t.sortOrder,
        now,
        now
      )
    }
  }

  // ================================================================
  // 向后兼容包装方法 — 委托给对应的子仓库
  // ================================================================

  // ----- ScriptParams -----
  createScriptParam(data: Omit<ScriptParam, 'id' | 'createdAt' | 'updatedAt'>): ScriptParam {
    return this._scriptParamRepo.create(data)
  }
  getScriptParam(id: string): ScriptParam | null {
    return this._scriptParamRepo.get(id)
  }
  listScriptParams(page = 1, pageSize = 20, search?: string): ListResponse<ScriptParam> {
    return this._scriptParamRepo.list(page, pageSize, search)
  }
  updateScriptParam(
    id: string,
    data: Partial<Omit<ScriptParam, 'id' | 'createdAt' | 'updatedAt'>>
  ): ScriptParam | null {
    return this._scriptParamRepo.update(id, data)
  }
  deleteScriptParam(id: string): boolean {
    return this._scriptParamRepo.delete(id)
  }
  listScriptParamPools(): string[] {
    return this._scriptParamRepo.listPools()
  }
  batchCreateScriptParams(items: Omit<ScriptParam, 'id' | 'createdAt' | 'updatedAt'>[]): number {
    return this._scriptParamRepo.batchCreate(items)
  }
  countScriptParamsByTemplate(templateId: string): number {
    return this._scriptParamRepo.countByTemplate(templateId)
  }

  // ----- Templates (账户模板) -----
  createTemplate(data: Omit<Template, 'id' | 'updatedAt'> & { id?: string }): Template {
    return this._templateRepo.create(data)
  }
  getTemplate(id: string): Template | null {
    return this._templateRepo.get(id)
  }
  listTemplates(page = 1, pageSize = 20, search?: string): ListResponse<Template> {
    return this._templateRepo.list(page, pageSize, search)
  }
  updateTemplate(id: string, data: Partial<Omit<Template, 'id' | 'updatedAt'>>): Template | null {
    return this._templateRepo.update(id, data)
  }
  deleteTemplate(id: string): boolean {
    return this._templateRepo.delete(id)
  }

  // ----- TaskTemplates (任务脚本模板) -----
  createTaskTemplate(
    data: Omit<TaskTemplate, 'id' | 'downloadedAt' | 'updatedAt'> & { id?: string }
  ): TaskTemplate {
    return this._taskTemplateRepo.create(data)
  }
  getTaskTemplate(id: string): TaskTemplate | null {
    return this._taskTemplateRepo.get(id)
  }
  listTaskTemplates(page = 1, pageSize = 20, search?: string): ListResponse<TaskTemplate> {
    return this._taskTemplateRepo.list(page, pageSize, search)
  }
  updateTaskTemplate(
    id: string,
    data: Partial<Omit<TaskTemplate, 'id' | 'downloadedAt' | 'updatedAt'>>
  ): TaskTemplate | null {
    return this._taskTemplateRepo.update(id, data)
  }
  deleteTaskTemplate(id: string): boolean {
    return this._taskTemplateRepo.delete(id)
  }

  // ----- ScheduledTasks -----
  createScheduledTask(data: Omit<ScheduledTask, 'id' | 'createdAt'>): ScheduledTask {
    return this._scheduledTaskRepo.create(data)
  }
  getScheduledTask(id: string): ScheduledTask | null {
    return this._scheduledTaskRepo.get(id)
  }
  listScheduledTasks(page = 1, pageSize = 20, search?: string): ListResponse<ScheduledTask> {
    return this._scheduledTaskRepo.list(page, pageSize, search)
  }
  updateScheduledTask(
    id: string,
    data: Partial<Omit<ScheduledTask, 'id' | 'createdAt'>>
  ): ScheduledTask | null {
    return this._scheduledTaskRepo.update(id, data)
  }
  deleteScheduledTask(id: string): boolean {
    return this._scheduledTaskRepo.delete(id)
  }

  // ----- Airdrops -----
  createAirdrop(data: Omit<AirdropProject, 'id' | 'createdAt' | 'updatedAt'>): AirdropProject {
    return this._airdropRepo.create(data)
  }
  getAirdrop(id: string): AirdropProject | null {
    return this._airdropRepo.get(id)
  }
  listAirdrops(page = 1, pageSize = 20, search?: string): ListResponse<AirdropProject> {
    return this._airdropRepo.list(page, pageSize, search)
  }
  updateAirdrop(
    id: string,
    data: Partial<Omit<AirdropProject, 'id' | 'createdAt' | 'updatedAt'>>
  ): AirdropProject | null {
    return this._airdropRepo.update(id, data)
  }
  deleteAirdrop(id: string): boolean {
    return this._airdropRepo.delete(id)
  }
  getAirdropAnalytics(): AirdropAnalytics {
    return this._airdropRepo.getAnalytics()
  }

  // ----- CaptchaKeys -----
  createCaptchaKey(data: Omit<CaptchaKey, 'id' | 'createdAt'>): CaptchaKey {
    return this._captchaKeyRepo.create(data)
  }
  getCaptchaKey(id: string): CaptchaKey | null {
    return this._captchaKeyRepo.get(id)
  }
  listCaptchaKeys(page = 1, pageSize = 20, search?: string): ListResponse<CaptchaKey> {
    return this._captchaKeyRepo.list(page, pageSize, search)
  }
  updateCaptchaKey(
    id: string,
    data: Partial<Omit<CaptchaKey, 'id' | 'createdAt'>>
  ): CaptchaKey | null {
    return this._captchaKeyRepo.update(id, data)
  }
  deleteCaptchaKey(id: string): boolean {
    return this._captchaKeyRepo.delete(id)
  }

  // ----- ProxyProviders -----
  createProxyProvider(data: Omit<ProxyProvider, 'id' | 'createdAt'>): ProxyProvider {
    return this._proxyProviderRepo.create(data)
  }
  getProxyProvider(id: string): ProxyProvider | null {
    return this._proxyProviderRepo.get(id)
  }
  listProxyProviders(page = 1, pageSize = 20, search?: string): ListResponse<ProxyProvider> {
    return this._proxyProviderRepo.list(page, pageSize, search)
  }
  updateProxyProvider(
    id: string,
    data: Partial<Omit<ProxyProvider, 'id' | 'createdAt'>>
  ): ProxyProvider | null {
    return this._proxyProviderRepo.update(id, data)
  }
  deleteProxyProvider(id: string): boolean {
    return this._proxyProviderRepo.delete(id)
  }

  // ----- AppLogs -----
  addAppLog(level: string, category: string, message: string, fields?: unknown): void {
    this._appLogRepo.add(level, category, message, fields)
  }
  listAppLogs(page = 1, pageSize = 20, search?: string): ListResponse<AppLog> {
    return this._appLogRepo.list(page, pageSize, search)
  }
  queryLogs(
    level?: string,
    category?: string,
    search?: string,
    since?: string,
    until?: string,
    limit = 100
  ): ListResponse<AppLog> {
    return this._appLogRepo.queryLogs(level, category, search, since, until, limit)
  }
  getLogCategories(): string[] {
    return this._appLogRepo.getCategories()
  }
  deleteAllLogs(): number {
    return this._appLogRepo.deleteAll()
  }

  // ----- Settings -----
  getSetting(key: string): string | null {
    return this._settingsRepo.get(key)
  }
  setSetting(key: string, value: string): void {
    this._settingsRepo.set(key, value)
  }
  getAllSettings(): Record<string, string> {
    return this._settingsRepo.getAll()
  }
  deleteSetting(key: string): boolean {
    return this._settingsRepo.delete(key)
  }

  setLogLevel(level: string): void {
    this.setSetting('logLevel', level)
  }
  getLogLevel(): string {
    return this.getSetting('logLevel') ?? 'info'
  }

  // ----- ProjectTemplates -----
  listProjectTemplates(): ProjectTemplate[] {
    return this._projectTemplateRepo.list()
  }
  getProjectTemplate(id: string): ProjectTemplate | null {
    return this._projectTemplateRepo.get(id)
  }
  createProjectTemplate(
    data: Omit<ProjectTemplate, 'id' | 'createdAt' | 'updatedAt'>
  ): ProjectTemplate {
    return this._projectTemplateRepo.create(data)
  }
  updateProjectTemplate(
    id: string,
    data: Partial<Omit<ProjectTemplate, 'id' | 'createdAt' | 'updatedAt'>>
  ): ProjectTemplate | null {
    return this._projectTemplateRepo.update(id, data)
  }
  deleteProjectTemplate(id: string): boolean {
    return this._projectTemplateRepo.delete(id)
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

    const scriptParamTotal = this._scriptParamRepo.count()
    const scriptParamPoolDistribution = this._scriptParamRepo.countByPool()

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
      name: row.template_name as string,
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
            return {
        name: row.template_name as string,
        taskCount: tc,
        successRate: tc > 0 ? Math.round((sc / tc) * 10000) / 10000 : 0
      } as TemplateRanking
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
      scriptParamTotal,
      scriptParamPoolDistribution,
      taskTotal,
      taskStatusDistribution,
      taskSuccessRate: taskSuccessRate ?? undefined,
      taskCompletedCount,
      taskErrorCount,
      totalFinishedTasks,
      averageTaskDurationSecs: averageTaskDurationSecs ?? undefined,
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
    const scriptParamCount = this._scriptParamRepo.count()
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
      scriptParamCount,
      proxyCount,
      taskCount,
      runningTaskCount,
      totalLogs: 0
    }
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

/**
 * @file 数据库初始化与预编译语句
 * @description SQLite 数据库连接、显式迁移框架（版本表 + 顺序脚本）与预编译语句。
 *              所有 schema 变更必须以独立 migration 函数形式追加到 MIGRATIONS 数组，
 *              通过 _migrations 版本表追踪执行状态，确保可追溯、可回放、幂等。
 * @module server/db
 */
import Database from 'better-sqlite3'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

/** 数据目录：server/data/ */
const dataDir = join(process.cwd(), 'data')
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true })
}

/** 数据库文件路径 */
const dbPath = join(dataDir, 'marketplace.db')

/** 导出的 SQLite 数据库实例 */
export const db = new Database(dbPath)

/** 启用 WAL 模式提升并发性能 */
db.pragma('journal_mode = WAL')
/** 启用外键约束 */
db.pragma('foreign_keys = ON')

// ───────────────────────────────────────────────────────────────────────────
// 迁移框架：版本表 + 顺序脚本
// ───────────────────────────────────────────────────────────────────────────
// 每个 migration 是一个命名函数，执行幂等的 schema 变更。
// 框架在事务中按序执行，已记录版本号的跳过，失败则回滚并抛出（阻断启动）。

/** 迁移记录：{ name, sql|null }，name 唯一标识，sql 为空表示用 fn 执行复杂逻辑 */
interface Migration {
  /** 迁移唯一标识（写入 _migrations.name） */
  name: string
  /** 迁移描述（仅文档用途） */
  description: string
  /** 执行函数，必须幂等（可重复执行不出错） */
  up: () => void
}

/**
 * 初始化迁移版本表。首次启动时创建，记录已执行的迁移名称。
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    executed_at TEXT NOT NULL
  )
`)

/**
 * 检查迁移是否已执行
 */
function isMigrationApplied(name: string): boolean {
  const row = db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(name)
  return !!row
}

/**
 * 记录迁移已执行
 */
function markMigrationApplied(name: string): void {
  db
    .prepare('INSERT INTO _migrations (name, executed_at) VALUES (?, ?)')
    .run(name, new Date().toISOString())
}

// ── 迁移脚本集合（按时间顺序追加，不得修改已发布的迁移） ──

/**
 * v001: 基础建表。scripts / templates / project_templates / users / script_reviews
 *       及 script_versions 表、索引。
 *       幂等：全部使用 CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS。
 */
function migrationV001InitialSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scripts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      schema TEXT NOT NULL DEFAULT '{}',
      entry_point TEXT NOT NULL DEFAULT '',
      checksum TEXT NOT NULL,
      file_path TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      changelog TEXT NOT NULL DEFAULT '',
      downloads INTEGER NOT NULL DEFAULT 0,
      visible INTEGER NOT NULL DEFAULT 1,
      created_by TEXT,
      review_status TEXT NOT NULL DEFAULT 'pending',
      review_comment TEXT DEFAULT '',
      avg_rating REAL NOT NULL DEFAULT 0,
      review_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      version TEXT NOT NULL DEFAULT '1.0.0',
      description TEXT NOT NULL DEFAULT '',
      schema TEXT NOT NULL DEFAULT '{}',
      checksum TEXT NOT NULL DEFAULT '',
      downloads INTEGER NOT NULL DEFAULT 0,
      visible INTEGER NOT NULL DEFAULT 1,
      created_by TEXT,
      review_status TEXT NOT NULL DEFAULT 'pending',
      review_comment TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT 'Folder',
      fields TEXT NOT NULL DEFAULT '[]',
      visible INTEGER NOT NULL DEFAULT 1,
      created_by TEXT,
      review_status TEXT NOT NULL DEFAULT 'pending',
      review_comment TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'developer', 'user')),
      api_key TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS script_reviews (
      id TEXT PRIMARY KEY,
      script_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      comment TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(script_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS script_versions (
      id TEXT PRIMARY KEY,
      script_id TEXT NOT NULL,
      version TEXT NOT NULL,
      changelog TEXT NOT NULL DEFAULT '',
      checksum TEXT NOT NULL,
      file_path TEXT NOT NULL,
      schema TEXT NOT NULL DEFAULT '{}',
      created_by TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_script_reviews_script_id ON script_reviews(script_id);
  `)
}

/**
 * 安全添加列：若列已存在则跳过。比 try/catch ALTER 更可读且不吞其他错误。
 * @param table 目标表名
 * @param column 新列名
 * @param definition 列定义（如 `INTEGER NOT NULL DEFAULT 1`）
 */
function addColumnIfMissing(table: string, column: string, definition: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (cols.some((c) => c.name === column)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

/**
 * v002: 为 scripts/templates 补 visible 列（兼容历史库）。
 */
function migrationV002AddVisible(): void {
  addColumnIfMissing('scripts', 'visible', 'INTEGER NOT NULL DEFAULT 1')
  addColumnIfMissing('templates', 'visible', 'INTEGER NOT NULL DEFAULT 1')
}

/**
 * v003: 为 scripts/templates 补 created_by 列。
 */
function migrationV003AddCreatedBy(): void {
  addColumnIfMissing('scripts', 'created_by', 'TEXT')
  addColumnIfMissing('templates', 'created_by', 'TEXT')
}

/**
 * v004: 为 scripts/templates 补 review_status / review_comment 列。
 */
function migrationV004AddReviewColumns(): void {
  addColumnIfMissing('scripts', 'review_status', "TEXT NOT NULL DEFAULT 'pending'")
  addColumnIfMissing('scripts', 'review_comment', "TEXT DEFAULT ''")
  addColumnIfMissing('templates', 'review_status', "TEXT NOT NULL DEFAULT 'pending'")
  addColumnIfMissing('templates', 'review_comment', "TEXT DEFAULT ''")
}

/**
 * v005: 为 scripts 补 avg_rating / review_count 列。
 */
function migrationV005AddRatingAgg(): void {
  addColumnIfMissing('scripts', 'avg_rating', 'REAL NOT NULL DEFAULT 0')
  addColumnIfMissing('scripts', 'review_count', 'INTEGER NOT NULL DEFAULT 0')
}

/**
 * v006: 创建 script_versions 表（兼容历史库，若已存在则跳过）。
 */
function migrationV006ScriptVersionsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS script_versions (
      id TEXT PRIMARY KEY,
      script_id TEXT NOT NULL,
      version TEXT NOT NULL,
      changelog TEXT NOT NULL DEFAULT '',
      checksum TEXT NOT NULL,
      file_path TEXT NOT NULL,
      schema TEXT NOT NULL DEFAULT '{}',
      created_by TEXT,
      created_at TEXT NOT NULL
    );
  `)
}

/**
 * v007: 为 users 补 api_key_hash 列（API Key 渐进迁移到哈希存储）。
 *       保留原 api_key 列做兼容；认证时优先校验 hash，命中旧明文则自动迁移。
 */
function migrationV007AddApiKeyHash(): void {
  addColumnIfMissing('users', 'api_key_hash', 'TEXT')
}

/** 迁移列表：按顺序追加，不可修改已发布的项 */
const MIGRATIONS: Migration[] = [
  {
    name: 'v001_initial_schema',
    description: '基础建表：scripts/templates/project_templates/users/script_reviews/script_versions',
    up: migrationV001InitialSchema
  },
  {
    name: 'v002_add_visible',
    description: '为 scripts/templates 补 visible 列',
    up: migrationV002AddVisible
  },
  {
    name: 'v003_add_created_by',
    description: '为 scripts/templates 补 created_by 列',
    up: migrationV003AddCreatedBy
  },
  {
    name: 'v004_add_review_columns',
    description: '为 scripts/templates 补审核状态列',
    up: migrationV004AddReviewColumns
  },
  {
    name: 'v005_add_rating_agg',
    description: '为 scripts 补评分聚合列',
    up: migrationV005AddRatingAgg
  },
  {
    name: 'v006_script_versions_table',
    description: '创建 script_versions 表',
    up: migrationV006ScriptVersionsTable
  },
  {
    name: 'v007_add_api_key_hash',
    description: '为 users 补 api_key_hash 列（API Key 哈希化渐进迁移）',
    up: migrationV007AddApiKeyHash
  }
]

/**
 * 执行所有未应用的迁移。每个迁移在独立事务中执行，失败则抛出阻断启动。
 */
function runMigrations(): void {
  for (const m of MIGRATIONS) {
    if (isMigrationApplied(m.name)) continue
    const tx = db.transaction(() => {
      m.up()
      markMigrationApplied(m.name)
    })
    try {
      tx()
    } catch (err) {
      console.error(`[db] Migration ${m.name} failed:`, err)
      throw err
    }
  }
}

runMigrations()

/** 预编译 SQL 语句集合 */
const stmts = {
  /** 插入新脚本记录 */
  scriptInsert: db.prepare(
    'INSERT INTO scripts (id, name, version, description, schema, entry_point, checksum, file_path, tags, changelog, downloads, visible, created_by, review_status, review_comment, avg_rating, review_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ),
  /** 查询所有可见脚本（按更新时间降序） */
  scriptGetAll: db.prepare('SELECT * FROM scripts WHERE visible = 1 ORDER BY updated_at DESC'),
  /** 管理员查询所有脚本（含不可见） */
  scriptGetAllAdmin: db.prepare('SELECT * FROM scripts ORDER BY updated_at DESC'),
  /** 按 ID 查询脚本 */
  scriptGetById: db.prepare('SELECT * FROM scripts WHERE id = ?'),
  /** 按创建者查询脚本 */
  scriptGetByAuthor: db.prepare('SELECT * FROM scripts WHERE created_by = ? ORDER BY updated_at DESC'),
  /** 查询待审核脚本 */
  scriptGetPending: db.prepare("SELECT * FROM scripts WHERE review_status = 'pending' ORDER BY created_at DESC"),
  /** 按创建者查询待审核脚本 */
  scriptGetMySubmissions: db.prepare("SELECT * FROM scripts WHERE created_by = ? ORDER BY created_at DESC"),
  /** 更新脚本信息 */
  scriptUpdate: db.prepare(
    'UPDATE scripts SET name=?, version=?, description=?, schema=?, entry_point=?, checksum=?, file_path=?, tags=?, changelog=?, visible=?, review_status=?, review_comment=?, updated_at=? WHERE id=?'
  ),
  /** 切换脚本可见性 */
  scriptPatch: db.prepare(
    'UPDATE scripts SET visible=? WHERE id=?'
  ),
  /** 审核脚本（设置审核状态、评论和可见性） */
  scriptReview: db.prepare(
    'UPDATE scripts SET review_status=?, review_comment=?, visible=?, updated_at=? WHERE id=?'
  ),
  /** 删除脚本 */
  scriptDelete: db.prepare('DELETE FROM scripts WHERE id = ?'),
  /** 增加脚本下载计数 */
  scriptIncrementDownloads: db.prepare('UPDATE scripts SET downloads = downloads + 1 WHERE id = ?'),

  /** 按脚本 ID 获取所有历史版本（按创建时间降序） */
  versionGetByScriptId: db.prepare('SELECT * FROM script_versions WHERE script_id = ? ORDER BY created_at DESC'),
  /** 插入新版本记录 */
  versionInsert: db.prepare(
    'INSERT INTO script_versions (id, script_id, version, changelog, checksum, file_path, schema, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ),
  /** 获取单个版本详情 */
  versionGetById: db.prepare('SELECT * FROM script_versions WHERE id = ?'),

  /** 插入/更新评分（upsert：插入，冲突时更新评分和评论） */
  reviewUpsert: db.prepare(
    'INSERT INTO script_reviews (id, script_id, user_id, rating, comment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(script_id, user_id) DO UPDATE SET rating=excluded.rating, comment=excluded.comment, updated_at=excluded.updated_at'
  ),
  /** 按脚本 ID 分页查询评分记录（按更新时间降序） */
  reviewGetByScriptId: db.prepare(
    'SELECT * FROM script_reviews WHERE script_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?'
  ),
  /** 按脚本 ID 统计评分总数 */
  reviewCountByScriptId: db.prepare(
    'SELECT COUNT(*) as count FROM script_reviews WHERE script_id = ?'
  ),
  /** 按用户和脚本查询单条评分 */
  reviewGetByUserAndScript: db.prepare(
    'SELECT * FROM script_reviews WHERE script_id = ? AND user_id = ?'
  ),
  /** 删除评分 */
  reviewDelete: db.prepare('DELETE FROM script_reviews WHERE id = ?'),
  /** 按脚本 ID 查询评分统计（平均分 + 各星级分布） */
  reviewGetStats: db.prepare(
    'SELECT AVG(rating) as avg_rating, COUNT(*) as count, SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as stars5, SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as stars4, SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as stars3, SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as stars2, SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as stars1 FROM script_reviews WHERE script_id = ?'
  ),
  /** 更新脚本评分聚合字段 */
  scriptUpdateRatingAgg: db.prepare(
    'UPDATE scripts SET avg_rating = ?, review_count = ? WHERE id = ?'
  ),

  /** 插入新模板记录 */
  templateInsert: db.prepare(
    'INSERT INTO templates (id, name, type, version, description, schema, checksum, downloads, visible, created_by, review_status, review_comment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ),
  /** 查询所有可见模板 */
  templateGetAll: db.prepare('SELECT * FROM templates WHERE visible = 1 ORDER BY updated_at DESC'),
  /** 管理员查询所有模板 */
  templateGetAllAdmin: db.prepare('SELECT * FROM templates ORDER BY updated_at DESC'),
  /** 按 ID 查询模板 */
  templateGetById: db.prepare('SELECT * FROM templates WHERE id = ?'),
  /** 按创建者查询模板 */
  templateGetByAuthor: db.prepare('SELECT * FROM templates WHERE created_by = ? ORDER BY updated_at DESC'),
  /** 查询待审核模板 */
  templateGetPending: db.prepare("SELECT * FROM templates WHERE review_status = 'pending' ORDER BY created_at DESC"),
  /** 按创建者查询待审核模板 */
  templateGetMySubmissions: db.prepare("SELECT * FROM templates WHERE created_by = ? ORDER BY created_at DESC"),
  /** 更新模板信息 */
  templateUpdate: db.prepare(
    'UPDATE templates SET name=?, type=?, version=?, description=?, schema=?, checksum=?, updated_at=? WHERE id=?'
  ),
  /** 切换模板可见性 */
  templatePatch: db.prepare(
    'UPDATE templates SET visible=? WHERE id=?'
  ),
  /** 审核模板 */
  templateReview: db.prepare(
    'UPDATE templates SET review_status=?, review_comment=?, visible=?, updated_at=? WHERE id=?'
  ),
  /** 删除模板 */
  templateDelete: db.prepare('DELETE FROM templates WHERE id = ?'),
  /** 增加模板下载计数 */
  templateIncrementDownloads: db.prepare('UPDATE templates SET downloads = downloads + 1 WHERE id = ?'),

  // project_templates CRUD (用户自定义的项目元数据模板, 9eb1428+ 同步)
  /** 插入项目模板 */
  projectTemplateInsert: db.prepare(
    'INSERT INTO project_templates (id, name, description, icon, fields, visible, created_by, review_status, review_comment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ),
  /** 列出所有可见项目模板 */
  projectTemplateGetAll: db.prepare(
    'SELECT * FROM project_templates WHERE visible = 1 ORDER BY created_at DESC'
  ),
  /** 管理员列出所有项目模板 */
  projectTemplateGetAllAdmin: db.prepare(
    'SELECT * FROM project_templates ORDER BY created_at DESC'
  ),
  /** 按 ID 查询 */
  projectTemplateGetById: db.prepare('SELECT * FROM project_templates WHERE id = ?'),
  /** 按作者查询 */
  projectTemplateGetByAuthor: db.prepare(
    'SELECT * FROM project_templates WHERE created_by = ? ORDER BY created_at DESC'
  ),
  /** 待审核 */
  projectTemplateGetPending: db.prepare(
    "SELECT * FROM project_templates WHERE review_status = 'pending' ORDER BY created_at DESC"
  ),
  /** 更新 */
  projectTemplateUpdate: db.prepare(
    'UPDATE project_templates SET name=?, description=?, icon=?, fields=?, visible=?, updated_at=? WHERE id=?'
  ),
  /** 切换可见性 */
  projectTemplatePatch: db.prepare(
    'UPDATE project_templates SET visible=? WHERE id=?'
  ),
  /** 审核 */
  projectTemplateReview: db.prepare(
    'UPDATE project_templates SET review_status=?, review_comment=?, visible=?, updated_at=? WHERE id=?'
  ),
  /** 删除 */
  projectTemplateDelete: db.prepare('DELETE FROM project_templates WHERE id = ?'),

  /** 插入新用户（含 api_key_hash，向后兼容旧 api_key 列） */
  userInsert: db.prepare(
    'INSERT INTO users (id, username, password_hash, display_name, role, api_key, api_key_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ),
  /** 按用户名查询用户 */
  userGetByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
  /** 按 API Key 明文查询用户（兼容旧数据；命中后应迁移到 hash） */
  userGetByApiKey: db.prepare('SELECT * FROM users WHERE api_key = ?'),
  /** 按 API Key 哈希查询用户（优先路径） */
  userGetByApiKeyHash: db.prepare('SELECT * FROM users WHERE api_key_hash = ?'),
  /** 按 ID 查询用户 */
  userGetById: db.prepare('SELECT * FROM users WHERE id = ?'),
  /** 查询所有用户（按创建时间降序） */
  userGetAll: db.prepare('SELECT * FROM users ORDER BY created_at DESC'),
  /** 删除用户 */
  userDelete: db.prepare('DELETE FROM users WHERE id = ?'),
  /** 更新用户显示名称和角色 */
  userUpdate: db.prepare('UPDATE users SET display_name=?, role=?, updated_at=? WHERE id=?'),
  /** 更新用户 API Key（明文列 + 哈希列同步设置） */
  userUpdateApiKey: db.prepare('UPDATE users SET api_key=?, api_key_hash=?, updated_at=? WHERE id=?'),
  /** 将用户 api_key_hash 置空（配合渐进迁移：旧明文命中后写入 hash） */
  userSetApiKeyHash: db.prepare('UPDATE users SET api_key_hash=?, updated_at=? WHERE id=?'),
  /** 统计用户总数 */
  userCount: db.prepare('SELECT COUNT(*) as count FROM users'),
}

export { stmts }

/**
 * 获取脚本上传目录路径
 * 如果目录不存在则自动创建
 *
 * @returns 脚本上传目录的绝对路径
 */
export function getScriptsDir(): string {
  const dir = join(dataDir, 'uploads', 'scripts')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

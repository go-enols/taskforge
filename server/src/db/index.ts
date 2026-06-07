/**
 * @file 数据库初始化与预编译语句
 * @description 创建/迁移 SQLite 数据库（marketplace.db），定义所有预编译 SQL 语句。
 *              自动处理列迁移（visible、created_by、review_status 等字段的追加）。
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

// ── Migration: add `visible` column to existing tables ──
/** 迁移：为 scripts 表添加 visible 列（可见性控制） */
try {
  const cols = db.pragma('table_info(scripts)') as Array<{ name: string }>
  if (!cols.some((c) => c.name === 'visible')) {
    db.exec('ALTER TABLE scripts ADD COLUMN visible INTEGER NOT NULL DEFAULT 1')
    console.log('[db] migrated: scripts.visible column added')
  }
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  if (!msg.includes('duplicate column') && !msg.includes('already exists')) {
    console.error('[db] Migration error:', msg)
  }
}
/** 迁移：为 templates 表添加 visible 列 */
try {
  const cols = db.pragma('table_info(templates)') as Array<{ name: string }>
  if (!cols.some((c) => c.name === 'visible')) {
    db.exec('ALTER TABLE templates ADD COLUMN visible INTEGER NOT NULL DEFAULT 1')
    console.log('[db] migrated: templates.visible column added')
  }
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  if (!msg.includes('duplicate column') && !msg.includes('already exists')) {
    console.error('[db] Migration error:', msg)
  }
}

/** 迁移：为 scripts 表添加 created_by 列（记录创建者） */
try {
  const cols = db.pragma('table_info(scripts)') as Array<{ name: string }>
  if (!cols.some((c) => c.name === 'created_by')) {
    db.exec('ALTER TABLE scripts ADD COLUMN created_by TEXT')
    console.log('[db] migrated: scripts.created_by column added')
  }
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  if (!msg.includes('duplicate column') && !msg.includes('already exists')) {
    console.error('[db] Migration error:', msg)
  }
}
/** 迁移：为 templates 表添加 created_by 列 */
try {
  const cols = db.pragma('table_info(templates)') as Array<{ name: string }>
  if (!cols.some((c) => c.name === 'created_by')) {
    db.exec('ALTER TABLE templates ADD COLUMN created_by TEXT')
    console.log('[db] migrated: templates.created_by column added')
  }
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  if (!msg.includes('duplicate column') && !msg.includes('already exists')) {
    console.error('[db] Migration error:', msg)
  }
}

/** 迁移：为 scripts 表添加 review_status/review_comment 列（审核功能） */
try {
  const cols = db.pragma('table_info(scripts)') as Array<{ name: string }>
  if (!cols.some((c) => c.name === 'review_status')) {
    db.exec("ALTER TABLE scripts ADD COLUMN review_status TEXT NOT NULL DEFAULT 'pending'")
    db.exec("ALTER TABLE scripts ADD COLUMN review_comment TEXT DEFAULT ''")
    console.log('[db] migrated: scripts.review_status/review_comment columns added')
  }
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  if (!msg.includes('duplicate column') && !msg.includes('already exists')) {
    console.error('[db] Migration error:', msg)
  }
}
/** 迁移：为 templates 表添加 review_status/review_comment 列 */
try {
  const cols = db.pragma('table_info(templates)') as Array<{ name: string }>
  if (!cols.some((c) => c.name === 'review_status')) {
    db.exec("ALTER TABLE templates ADD COLUMN review_status TEXT NOT NULL DEFAULT 'pending'")
    db.exec("ALTER TABLE templates ADD COLUMN review_comment TEXT DEFAULT ''")
    console.log('[db] migrated: templates.review_status/review_comment columns added')
  }
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  if (!msg.includes('duplicate column') && !msg.includes('already exists')) {
    console.error('[db] Migration error:', msg)
  }
}

/** 迁移：为 scripts 表添加 avg_rating/review_count 列（评分聚合） */
try {
  const cols = db.pragma('table_info(scripts)') as Array<{ name: string }>
  if (!cols.some((c) => c.name === 'avg_rating')) {
    db.exec('ALTER TABLE scripts ADD COLUMN avg_rating REAL NOT NULL DEFAULT 0')
    db.exec('ALTER TABLE scripts ADD COLUMN review_count INTEGER NOT NULL DEFAULT 0')
    console.log('[db] migrated: scripts.avg_rating/review_count columns added')
  }
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  if (!msg.includes('duplicate column') && !msg.includes('already exists')) {
    console.error('[db] Migration error:', msg)
  }
}

/** 建表语句：scripts（脚本）、templates（模板）、users（用户）、script_reviews（评分/评论） */
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
`)

/** 创建索引：加速按脚本 ID 查询评分 */
db.exec('CREATE INDEX IF NOT EXISTS idx_script_reviews_script_id ON script_reviews(script_id)')

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
  scriptGetPendingByAuthor: db.prepare("SELECT * FROM scripts WHERE created_by = ? AND review_status = 'pending' ORDER BY created_at DESC"),
  /** 更新脚本信息 */
  scriptUpdate: db.prepare(
    'UPDATE scripts SET name=?, version=?, description=?, schema=?, entry_point=?, checksum=?, file_path=?, tags=?, changelog=?, updated_at=? WHERE id=?'
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
  templateGetPendingByAuthor: db.prepare("SELECT * FROM templates WHERE created_by = ? AND review_status = 'pending' ORDER BY created_at DESC"),
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

  /** 插入新用户 */
  userInsert: db.prepare('INSERT INTO users (id, username, password_hash, display_name, role, api_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  /** 按用户名查询用户 */
  userGetByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
  /** 按 API Key 查询用户 */
  userGetByApiKey: db.prepare('SELECT * FROM users WHERE api_key = ?'),
  /** 按 ID 查询用户 */
  userGetById: db.prepare('SELECT * FROM users WHERE id = ?'),
  /** 查询所有用户（按创建时间降序） */
  userGetAll: db.prepare('SELECT * FROM users ORDER BY created_at DESC'),
  /** 删除用户 */
  userDelete: db.prepare('DELETE FROM users WHERE id = ?'),
  /** 更新用户显示名称和角色 */
  userUpdate: db.prepare('UPDATE users SET display_name=?, role=?, updated_at=? WHERE id=?'),
  /** 更新用户 API Key */
  userUpdateApiKey: db.prepare('UPDATE users SET api_key=?, updated_at=? WHERE id=?'),
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

// getTemplatesDir was removed — unused (no callers)

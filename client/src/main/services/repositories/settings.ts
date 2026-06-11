/**
 * @file SettingsRepository — 应用设置数据仓库
 * @description 封装 settings 表的全部 CRUD 操作，支持键值对的读取、写入、
 *              删除和全量列举。
 * @module main/services/repositories
 */
import Database from 'better-sqlite3'
import { BaseRepository } from './base'

/**
 * 应用设置数据仓库
 *
 * 提供简单的键值对存储用于持久化应用配置。
 * 使用 INSERT OR REPLACE 实现 upsert 语义。
 *
 * @example
 * ```ts
 * const repo = new SettingsRepository(db)
 * repo.set('theme', 'dark')
 * const theme = repo.get('theme')
 * ```
 */
export class SettingsRepository extends BaseRepository {
  /**
   * @param db - better-sqlite3 数据库连接
   */
  constructor(db: Database.Database) {
    super(db)
    this.prepareStatements()
  }

  /** 注册所有设置相关的预编译 SQL 语句 */
  prepareStatements(): void {
    this.setStmt(
      'setting.get',
      this.db.prepare('SELECT value FROM settings WHERE key = ?')
    )
    this.setStmt(
      'setting.set',
      this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    )
    this.setStmt(
      'setting.delete',
      this.db.prepare('DELETE FROM settings WHERE key = ?')
    )
    this.setStmt(
      'setting.getAll',
      this.db.prepare('SELECT key, value FROM settings')
    )
  }

  /**
   * 获取设置项的值
   * @param key - 设置键名
   * @returns 设置值，不存在时返回 null
   */
  get(key: string): string | null {
    const row = this.stmt('setting.get').get(key) as Record<string, string> | undefined
    return row ? row.value : null
  }

  /**
   * 设置键值对（INSERT OR REPLACE）
   * @param key   - 设置键名
   * @param value - 设置值
   */
  set(key: string, value: string): void {
    this.stmt('setting.set').run(key, value)
  }

  /**
   * 获取所有设置项
   * @returns 键值对对象
   */
  getAll(): Record<string, string> {
    const rows = this.stmt('setting.getAll').all() as Record<string, string>[]
    const result: Record<string, string> = {}
    for (const row of rows) {
      result[row.key] = row.value
    }
    return result
  }

  /**
   * 删除设置项
   * @param key - 设置键名
   * @returns 是否成功删除
   */
  delete(key: string): boolean {
    const result = this.stmt('setting.delete').run(key)
    return result.changes > 0
  }
}

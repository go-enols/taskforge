/**
 * @file AppLogRepository — 应用日志数据仓库
 * @description 封装 app_logs 表的全部 CRUD 操作，支持分页查询、高级过滤、
 *              分类获取和日志清理等功能。
 * @module main/services/repositories
 */
import Database from 'better-sqlite3'
import type { AppLog, ListResponse } from '../../../shared/types'
import { BaseRepository } from './base'

/**
 * 应用日志数据仓库
 *
 * 管理应用程序的日志记录，支持按级别、分类、关键词、时间范围
 * 等多种维度的过滤查询，以及分类列举和批量清理。
 *
 * @example
 * ```ts
 * const repo = new AppLogRepository(db)
 * repo.add('info', 'system', 'App started')
 * const list = repo.list(1, 20)
 * const results = repo.queryLogs('error', 'system', undefined, undefined, undefined, 50)
 * ```
 */
export class AppLogRepository extends BaseRepository<AppLog> {
  /**
   * @param db - better-sqlite3 数据库连接
   */
  constructor(db: Database.Database) {
    super(db)
    this.prepareStatements()
  }

  /** 注册所有应用日志相关的预编译 SQL 语句 */
  prepareStatements(): void {
    this.setStmt(
      'appLog.insert',
      this.db.prepare(
        'INSERT INTO app_logs (timestamp, level, category, message, fields) VALUES (?, ?, ?, ?, ?)'
      )
    )
  }

  /**
   * 将数据库行记录映射为 AppLog 对象
   * 自动反序列化 fields JSON 字段。
   * @param row - 数据库查询返回的原始行数据
   * @returns 组装好的 AppLog 实体
   */
  private rowToAppLog(row: Record<string, unknown>): AppLog {
    return {
      id: row.id as number,
      timestamp: row.timestamp as string,
      level: row.level as string,
      category: row.category as string,
      message: row.message as string,
      fields: this.fromJson(row.fields as string | null)
    }
  }

  /**
   * 添加应用日志
   * @param level    - 日志级别（info / warn / error / debug）
   * @param category - 日志分类
   * @param message  - 日志内容
   * @param fields   - 可选的附加字段（自动序列化为 JSON）
   */
  add(level: string, category: string, message: string, fields?: unknown): void {
    this.stmt('appLog.insert').run(this.nowISO(), level, category, message, this.toJson(fields))
  }

  /**
   * 分页查询应用日志（支持按分类或内容模糊搜索）
   * @param page     - 页码（默认 1）
   * @param pageSize - 每页条数（默认 20）
   * @param search   - 可选搜索关键词
   * @returns 分页结果
   */
  list(page = 1, pageSize = 20, search?: string): ListResponse<AppLog> {
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
   * 高级日志查询（支持按级别、分类、关键词、时间范围过滤）
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
   * @returns 分类名称数组（已排序）
   */
  getCategories(): string[] {
    const rows = this.db
      .prepare('SELECT DISTINCT category FROM app_logs ORDER BY category')
      .all() as Record<string, string>[]
    return rows.map((r) => r.category)
  }

  /** 删除所有应用日志（用于日志清理） */
  deleteAll(): number {
    const result = this.db.prepare('DELETE FROM app_logs').run()
    return result.changes
  }
}

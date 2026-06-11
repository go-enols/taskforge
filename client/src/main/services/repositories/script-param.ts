/**
 * @file ScriptParamRepository — 脚本参数数据仓库
 * @description 封装 script_params 表的全部 CRUD 操作，支持分页查询、批量创建、
 *              参数池管理和按模板统计等功能。继承自 BaseRepository 使用预编译语句。
 * @module main/services/repositories
 */
import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import type { ScriptParam, ListResponse } from '../../../shared/types'
import { BaseRepository } from './base'

/**
 * 脚本参数数据仓库
 *
 * 管理脚本参数（原账号池账户）的持久化，每个脚本参数关联一个模板(template)，
 * 数据字段由模板的 JSON Schema 定义。支持按参数池(pool)分组和模糊搜索。
 *
 * @example
 * ```ts
 * const repo = new ScriptParamRepository(db)
 * const param = repo.create({ templateId: 'tpl-1', data: {...}, pool: 'main', ... })
 * const list = repo.list(1, 20, 'main')
 * ```
 */
export class ScriptParamRepository extends BaseRepository<ScriptParam> {
  /**
   * @param db - better-sqlite3 数据库连接
   */
  constructor(db: Database.Database) {
    super(db)
    this.prepareStatements()
  }

  /** 注册所有脚本参数相关的预编译 SQL 语句 */
  prepareStatements(): void {
    this.setStmt(
      'scriptParam.insert',
      this.db.prepare(
        'INSERT INTO script_params (id, template_id, data, pool, labels, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
    )
    this.setStmt(
      'scriptParam.getById',
      this.db.prepare('SELECT * FROM script_params WHERE id = ?')
    )
    this.setStmt(
      'scriptParam.update',
      this.db.prepare(
        'UPDATE script_params SET template_id=?, data=?, pool=?, labels=?, notes=?, updated_at=? WHERE id=?'
      )
    )
    this.setStmt(
      'scriptParam.delete',
      this.db.prepare('DELETE FROM script_params WHERE id = ?')
    )
    this.setStmt(
      'scriptParam.count',
      this.db.prepare('SELECT COUNT(*) as cnt FROM script_params')
    )
    this.setStmt(
      'scriptParam.countByPool',
      this.db.prepare('SELECT pool, COUNT(*) as cnt FROM script_params GROUP BY pool')
    )
  }

  /**
   * 将数据库行记录映射为 ScriptParam 对象
   * 解析 JSON data/labels 字段。
   * @param row - 数据库查询返回的原始行数据
   * @returns 组装好的 ScriptParam 实体
   */
  private rowToScriptParam(row: Record<string, unknown>): ScriptParam {
    return {
      id: row.id as string,
      templateId: row.template_id as string,
      data: this.fromJson<Record<string, unknown>>(row.data as string | null) ?? {},
      pool: row.pool as string,
      labels: this.fromJsonArray<string>(row.labels as string | null),
      notes: row.notes as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string
    }
  }

  /** 获取脚本参数总数 */
  count(): number {
    return (this.stmt('scriptParam.count').get() as Record<string, number>).cnt
  }

  /**
   * 按参数池统计数量
   * @returns 参数池名 → 数量的映射
   */
  countByPool(): Record<string, number> {
    const rows = this.stmt('scriptParam.countByPool').all() as Record<string, unknown>[]
    const result: Record<string, number> = {}
    for (const row of rows) {
      result[row.pool as string] = row.cnt as number
    }
    return result
  }

  /**
   * 创建脚本参数
   * 自动生成 UUID 和 ISO 时间戳。
   * @param data - 脚本参数数据（不含 id/createdAt/updatedAt）
   * @returns 创建的 ScriptParam 对象
   */
  create(data: Omit<ScriptParam, 'id' | 'createdAt' | 'updatedAt'>): ScriptParam {
    const id = uuidv4()
    const now = this.nowISO()
    this.stmt('scriptParam.insert').run(
      id,
      data.templateId,
      this.toJson(data.data),
      data.pool,
      this.toJson(data.labels),
      data.notes,
      now,
      now
    )
    return this.get(id)!
  }

  /**
   * 根据 ID 获取脚本参数
   * @param id - 脚本参数 UUID
   * @returns ScriptParam 对象，不存在时返回 null
   */
  get(id: string): ScriptParam | null {
    const row = this.stmt('scriptParam.getById').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToScriptParam(row) : null
  }

  /**
   * 分页查询脚本参数列表（支持按 pool 或 notes 模糊搜索）
   * @param page     - 页码（默认 1）
   * @param pageSize - 每页条数（默认 20）
   * @param search   - 可选搜索关键词
   * @returns 分页结果
   */
  list(page = 1, pageSize = 20, search?: string): ListResponse<ScriptParam> {
    if (search) {
      const countStmt = this.db.prepare(
        'SELECT COUNT(*) as cnt FROM script_params WHERE pool LIKE ? OR notes LIKE ?'
      )
      const listStmt = this.db.prepare(
        'SELECT * FROM script_params WHERE pool LIKE ? OR notes LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
      )
      return this.paginate(countStmt, listStmt, page, pageSize, (r) => this.rowToScriptParam(r), [
        `%${search}%`,
        `%${search}%`
      ])
    }
    const countStmt = this.stmt('scriptParam.count')
    const listStmt = this.db.prepare(
      'SELECT * FROM script_params ORDER BY created_at DESC LIMIT ? OFFSET ?'
    )
    return this.paginate(countStmt, listStmt, page, pageSize, (r) => this.rowToScriptParam(r))
  }

  /**
   * 更新脚本参数
   * @param id   - 脚本参数 UUID
   * @param data - 要更新的字段（部分更新）
   * @returns 更新后的 ScriptParam 对象，不存在时返回 null
   */
  update(
    id: string,
    data: Partial<Omit<ScriptParam, 'id' | 'createdAt' | 'updatedAt'>>
  ): ScriptParam | null {
    const existing = this.get(id)
    if (!existing) return null
    const updated = { ...existing, ...data, updatedAt: this.nowISO() }
    this.stmt('scriptParam.update').run(
      updated.templateId,
      this.toJson(updated.data),
      updated.pool,
      this.toJson(updated.labels),
      updated.notes,
      updated.updatedAt,
      id
    )
    return this.get(id)
  }

  /**
   * 删除脚本参数
   * @param id - 脚本参数 UUID
   * @returns 是否成功删除
   */
  delete(id: string): boolean {
    const result = this.stmt('scriptParam.delete').run(id)
    return result.changes > 0
  }

  /**
   * 获取所有不重复的参数池名称
   * @returns 参数池名称数组（已排序）
   */
  listPools(): string[] {
    const rows = this.db
      .prepare(
        "SELECT DISTINCT pool FROM script_params WHERE pool IS NOT NULL AND pool != '' ORDER BY pool"
      )
      .all() as Array<{ pool: string }>
    return rows.map((r) => r.pool)
  }

  /**
   * 批量创建脚本参数（事务内执行）
   * @param items - 脚本参数数据数组
   * @returns 成功创建的脚本参数数量
   */
  batchCreate(items: Omit<ScriptParam, 'id' | 'createdAt' | 'updatedAt'>[]): number {
    const insert = this.stmt('scriptParam.insert')
    const transaction = this.db.transaction(
      (data: Omit<ScriptParam, 'id' | 'createdAt' | 'updatedAt'>[]) => {
        let count = 0
        for (const item of data) {
          const id = uuidv4()
          const now = this.nowISO()
          insert.run(
            id,
            item.templateId,
            this.toJson(item.data),
            item.pool,
            this.toJson(item.labels),
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
   * 统计使用指定模板的脚本参数数量
   * @param templateId - 模板 UUID
   * @returns 脚本参数数量
   */
  countByTemplate(templateId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as cnt FROM script_params WHERE template_id = ?')
      .get(templateId) as { cnt: number }
    return row.cnt
  }
}

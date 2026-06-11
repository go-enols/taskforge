/**
 * @file TemplateRepository — 账户模板数据仓库
 * @description 封装 templates 表的全部 CRUD 操作，支持分页查询和模糊搜索。
 *              每个模板包含 JSON Schema 定义账户数据字段结构。
 * @module main/services/repositories
 */
import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import type { Template, ListResponse } from '../../../shared/types'
import { BaseRepository } from './base'

/**
 * 账户模板数据仓库
 *
 * 管理账户模板（定义账户的数据结构，如 EVM 钱包需要 address + privateKey）。
 * 模板可从 Marketplace Server 下载或本地创建。
 *
 * @example
 * ```ts
 * const repo = new TemplateRepository(db)
 * const tpl = repo.create({ type: 'evm-wallet', name: 'EVM Wallet', ... })
 * const list = repo.list(1, 20, 'evm')
 * ```
 */
export class TemplateRepository extends BaseRepository<Template> {
  /**
   * @param db - better-sqlite3 数据库连接
   */
  constructor(db: Database.Database) {
    super(db)
    this.prepareStatements()
  }

  /** 注册所有模板相关的预编译 SQL 语句 */
  prepareStatements(): void {
    this.setStmt(
      'template.insert',
      this.db.prepare(
        'INSERT INTO templates (id, type, name, schema, version, is_local, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
    )
    this.setStmt('template.getById', this.db.prepare('SELECT * FROM templates WHERE id = ?'))
    this.setStmt(
      'template.update',
      this.db.prepare(
        'UPDATE templates SET type=?, name=?, schema=?, version=?, is_local=?, updated_at=? WHERE id=?'
      )
    )
    this.setStmt('template.delete', this.db.prepare('DELETE FROM templates WHERE id = ?'))
  }

  /**
   * 将数据库行记录映射为 Template 对象
   * 解析 JSON schema 字段。
   * @param row - 数据库查询返回的原始行数据
   * @returns 组装好的 Template 实体
   */
  private rowToTemplate(row: Record<string, unknown>): Template {
    return {
      id: row.id as string,
      type: row.type as string,
      name: row.name as string,
      schema: this.fromJson<Record<string, unknown>>(row.schema as string | null) ?? {},
      version: row.version as string,
      isLocal: (row.is_local as number) === 1,
      updatedAt: row.updated_at as string
    }
  }

  /**
   * 创建账户模板
   * @param data - 模板数据（id 可选，不提供时自动生成 UUID）
   * @returns 创建的 Template 对象
   */
  create(data: Omit<Template, 'id' | 'updatedAt'> & { id?: string }): Template {
    const id = data.id ?? uuidv4()
    const updatedAt = this.nowISO()
    this.stmt('template.insert').run(
      id,
      data.type,
      data.name,
      this.toJson(data.schema),
      data.version,
      data.isLocal ? 1 : 0,
      updatedAt
    )
    return this.get(id)!
  }

  /**
   * 根据 ID 获取账户模板
   * @param id - 模板 UUID
   * @returns Template 对象，不存在时返回 null
   */
  get(id: string): Template | null {
    const row = this.stmt('template.getById').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToTemplate(row) : null
  }

  /**
   * 分页查询模板列表（支持按名称或类型模糊搜索）
   * @param page     - 页码（默认 1）
   * @param pageSize - 每页条数（默认 20）
   * @param search   - 可选搜索关键词
   * @returns 分页结果
   */
  list(page = 1, pageSize = 20, search?: string): ListResponse<Template> {
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
   * @param id   - 模板 UUID
   * @param data - 要更新的字段
   * @returns 更新后的 Template 对象，不存在时返回 null
   */
  update(id: string, data: Partial<Omit<Template, 'id' | 'updatedAt'>>): Template | null {
    const existing = this.get(id)
    if (!existing) return null
    const updated = { ...existing, ...data, updatedAt: this.nowISO() }
    this.stmt('template.update').run(
      updated.type,
      updated.name,
      this.toJson(updated.schema),
      updated.version,
      updated.isLocal ? 1 : 0,
      updated.updatedAt,
      id
    )
    return this.get(id)
  }

  /**
   * 删除账户模板
   * @param id - 模板 UUID
   * @returns 是否成功删除
   */
  delete(id: string): boolean {
    const result = this.stmt('template.delete').run(id)
    return result.changes > 0
  }
}

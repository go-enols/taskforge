/**
 * @file ProjectTemplateRepository — 项目模板数据仓库
 * @description 封装 project_templates 表的全部 CRUD 操作，内置模板不可删除。
 *              每个项目模板包含自定义字段定义，用于空投项目的结构化信息扩展。
 * @module main/services/repositories
 */
import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import type { ProjectTemplate, ProjectTemplateField } from '../../../shared/types'
import { BaseRepository } from './base'

/**
 * 项目模板数据仓库
 *
 * 管理空投项目的模板配置，支持自定义字段定义。
 * 内置模板（builtIn=true）不允许删除。
 *
 * @example
 * ```ts
 * const repo = new ProjectTemplateRepository(db)
 * const tpl = repo.create({ name: 'My Template', ... })
 * const list = repo.list()
 * ```
 */
export class ProjectTemplateRepository extends BaseRepository<ProjectTemplate> {
  /**
   * @param db - better-sqlite3 数据库连接
   */
  constructor(db: Database.Database) {
    super(db)
    this.prepareStatements()
  }

  /** 注册所有项目模板相关的预编译 SQL 语句 */
  prepareStatements(): void {
    this.setStmt(
      'projectTemplate.insert',
      this.db.prepare(
        'INSERT INTO project_templates (id, name, description, icon, fields, built_in, enabled, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
    )
    this.setStmt(
      'projectTemplate.update',
      this.db.prepare(
        'UPDATE project_templates SET name=?, description=?, icon=?, fields=?, built_in=?, enabled=?, sort_order=?, updated_at=? WHERE id=?'
      )
    )
    this.setStmt(
      'projectTemplate.delete',
      this.db.prepare('DELETE FROM project_templates WHERE id = ?')
    )
    this.setStmt(
      'projectTemplate.getById',
      this.db.prepare('SELECT * FROM project_templates WHERE id = ?')
    )
    this.setStmt(
      'projectTemplate.list',
      this.db.prepare(
        'SELECT * FROM project_templates ORDER BY sort_order ASC, created_at ASC'
      )
    )
    this.setStmt(
      'projectTemplate.exists',
      this.db.prepare('SELECT 1 FROM project_templates WHERE id = ?')
    )
  }

  /**
   * 将数据库行记录映射为 ProjectTemplate 对象
   * 解析 JSON fields 字段，转换 built_in/enabled 从 INTEGER 转为 boolean。
   * @param row - 数据库查询返回的原始行数据
   * @returns 组装好的 ProjectTemplate 实体
   */
  private rowToProjectTemplate(row: Record<string, unknown>): ProjectTemplate {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string,
      icon: row.icon as string,
      fields: this.fromJson<ProjectTemplateField[]>(row.fields as string | null) ?? [],
      builtIn: (row.built_in as number) === 1,
      enabled: (row.enabled as number) === 1,
      sortOrder: row.sort_order as number,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string
    }
  }

  /** 列出所有项目模板 (按 sortOrder ASC, createdAt ASC) */
  list(): ProjectTemplate[] {
    const rows = this.stmt('projectTemplate.list').all() as Record<string, unknown>[]
    return rows.map((r) => this.rowToProjectTemplate(r))
  }

  /** 获取单个项目模板 */
  get(id: string): ProjectTemplate | null {
    const row = this.stmt('projectTemplate.getById').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToProjectTemplate(row) : null
  }

  /** 创建项目模板 */
  create(data: Omit<ProjectTemplate, 'id' | 'createdAt' | 'updatedAt'>): ProjectTemplate {
    const id = uuidv4()
    const now = this.nowISO()
    this.stmt('projectTemplate.insert').run(
      id,
      data.name,
      data.description,
      data.icon,
      this.toJson(data.fields),
      data.builtIn ? 1 : 0,
      data.enabled ? 1 : 0,
      data.sortOrder,
      now,
      now
    )
    return this.get(id)!
  }

  /** 更新项目模板 */
  update(
    id: string,
    data: Partial<Omit<ProjectTemplate, 'id' | 'createdAt' | 'updatedAt'>>
  ): ProjectTemplate | null {
    const existing = this.get(id)
    if (!existing) return null
    const updated = { ...existing, ...data, updatedAt: this.nowISO() }
    this.stmt('projectTemplate.update').run(
      updated.name,
      updated.description,
      updated.icon,
      this.toJson(updated.fields),
      updated.builtIn ? 1 : 0,
      updated.enabled ? 1 : 0,
      updated.sortOrder,
      updated.updatedAt,
      id
    )
    return this.get(id)
  }

  /** 删除项目模板 (内置模板不允许删除) */
  delete(id: string): boolean {
    const existing = this.get(id)
    if (!existing) return false
    if (existing.builtIn) return false
    const result = this.stmt('projectTemplate.delete').run(id)
    return result.changes > 0
  }
}

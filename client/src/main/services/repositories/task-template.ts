/**
 * @file TaskTemplateRepository — 任务脚本模板数据仓库
 * @description 封装 task_templates 表的全部 CRUD 操作，支持分页查询和模糊搜索。
 *              每个任务脚本模板记录已安装脚本的元数据信息。
 * @module main/services/repositories
 */
import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import type { TaskTemplate, ListResponse } from '../../../shared/types'
import { BaseRepository } from './base'

/**
 * 任务脚本模板数据仓库
 *
 * 管理已安装的任务脚本元数据，记录脚本的名称、版本、描述、安装路径、
 * manifest 配置和远程 URL 等信息。
 *
 * @example
 * ```ts
 * const repo = new TaskTemplateRepository(db)
 * const tpl = repo.create({ name: 'Test Script', ... })
 * const list = repo.list(1, 20, 'test')
 * ```
 */
export class TaskTemplateRepository extends BaseRepository<TaskTemplate> {
  /**
   * @param db - better-sqlite3 数据库连接
   */
  constructor(db: Database.Database) {
    super(db)
    this.prepareStatements()
  }

  /** 注册所有任务脚本模板相关的预编译 SQL 语句 */
  prepareStatements(): void {
    this.setStmt(
      'taskTemplate.insert',
      this.db.prepare(
        'INSERT INTO task_templates (id, name, version, description, install_path, manifest, remote_url, is_installed, downloaded_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
    )
    this.setStmt(
      'taskTemplate.getById',
      this.db.prepare('SELECT * FROM task_templates WHERE id = ?')
    )
    this.setStmt(
      'taskTemplate.update',
      this.db.prepare(
        'UPDATE task_templates SET name=?, version=?, description=?, install_path=?, manifest=?, remote_url=?, is_installed=?, downloaded_at=?, updated_at=? WHERE id=?'
      )
    )
    this.setStmt(
      'taskTemplate.delete',
      this.db.prepare('DELETE FROM task_templates WHERE id = ?')
    )
  }

  /**
   * 将数据库行记录映射为 TaskTemplate 对象
   * 解析 JSON manifest 字段。
   * @param row - 数据库查询返回的原始行数据
   * @returns 组装好的 TaskTemplate 实体
   */
  private rowToTaskTemplate(row: Record<string, unknown>): TaskTemplate {
    return {
      id: row.id as string,
      name: row.name as string,
      version: row.version as string,
      description: row.description as string,
      installPath: row.install_path as string,
      manifest: this.fromJson<Record<string, unknown>>(row.manifest as string | null) ?? {},
      remoteUrl: row.remote_url as string | null,
      isInstalled: (row.is_installed as number) === 1,
      downloadedAt: row.downloaded_at as string,
      updatedAt: row.updated_at as string
    }
  }

  /**
   * 创建任务脚本模板
   * @param data - 任务脚本模板数据（id 可选，不提供时自动生成 UUID）
   * @returns 创建的 TaskTemplate 对象
   */
  create(
    data: Omit<TaskTemplate, 'id' | 'downloadedAt' | 'updatedAt'> & { id?: string }
  ): TaskTemplate {
    const id = data.id ?? uuidv4()
    const now = this.nowISO()
    this.stmt('taskTemplate.insert').run(
      id,
      data.name,
      data.version,
      data.description,
      data.installPath,
      this.toJson(data.manifest),
      data.remoteUrl ?? null,
      data.isInstalled ? 1 : 0,
      now,
      now
    )
    return this.get(id)!
  }

  /**
   * 根据 ID 获取任务脚本模板
   * @param id - 任务脚本模板 UUID
   * @returns TaskTemplate 对象，不存在时返回 null
   */
  get(id: string): TaskTemplate | null {
    const row = this.stmt('taskTemplate.getById').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToTaskTemplate(row) : null
  }

  /**
   * 分页查询任务脚本模板列表（支持按名称或描述模糊搜索）
   * @param page     - 页码（默认 1）
   * @param pageSize - 每页条数（默认 20）
   * @param search   - 可选搜索关键词
   * @returns 分页结果
   */
  list(page = 1, pageSize = 20, search?: string): ListResponse<TaskTemplate> {
    if (search) {
      const countStmt = this.db.prepare(
        'SELECT COUNT(*) as cnt FROM task_templates WHERE name LIKE ? OR description LIKE ?'
      )
      const listStmt = this.db.prepare(
        'SELECT * FROM task_templates WHERE name LIKE ? OR description LIKE ? ORDER BY updated_at DESC LIMIT ? OFFSET ?'
      )
      return this.paginate(countStmt, listStmt, page, pageSize, (r) =>
        this.rowToTaskTemplate(r), [`%${search}%`, `%${search}%`])
    }
    const countStmt = this.db.prepare('SELECT COUNT(*) as cnt FROM task_templates')
    const listStmt = this.db.prepare(
      'SELECT * FROM task_templates ORDER BY updated_at DESC LIMIT ? OFFSET ?'
    )
    return this.paginate(countStmt, listStmt, page, pageSize, (r) => this.rowToTaskTemplate(r))
  }

  /**
   * 更新任务脚本模板
   * @param id   - 任务脚本模板 UUID
   * @param data - 要更新的字段
   * @returns 更新后的 TaskTemplate 对象，不存在时返回 null
   */
  update(
    id: string,
    data: Partial<Omit<TaskTemplate, 'id' | 'downloadedAt' | 'updatedAt'>>
  ): TaskTemplate | null {
    const existing = this.get(id)
    if (!existing) return null
    const updated = { ...existing, ...data, updatedAt: this.nowISO() }
    this.stmt('taskTemplate.update').run(
      updated.name,
      updated.version,
      updated.description,
      updated.installPath,
      this.toJson(updated.manifest),
      updated.remoteUrl ?? null,
      updated.isInstalled ? 1 : 0,
      updated.downloadedAt,
      updated.updatedAt,
      id
    )
    return this.get(id)
  }

  /**
   * 删除任务脚本模板
   * @param id - 任务脚本模板 UUID
   * @returns 是否成功删除
   */
  delete(id: string): boolean {
    const result = this.stmt('taskTemplate.delete').run(id)
    return result.changes > 0
  }
}

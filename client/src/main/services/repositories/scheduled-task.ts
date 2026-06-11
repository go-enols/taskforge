/**
 * @file ScheduledTaskRepository — 定时任务数据仓库
 * @description 封装 scheduled_tasks 表的全部 CRUD 操作，支持分页查询和模糊搜索。
 *              每个定时任务关联一个任务脚本模板，配置 Cron 表达式进行调度。
 * @module main/services/repositories
 */
import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import type { ScheduledTask, ListResponse } from '../../../shared/types'
import { BaseRepository } from './base'

/**
 * 定时任务数据仓库
 *
 * 管理定时任务配置，支持通过 Cron 表达式调度脚本执行。
 * 每个定时任务关联一个任务脚本模板 ID。
 *
 * @example
 * ```ts
 * const repo = new ScheduledTaskRepository(db)
 * const task = repo.create({ templateId: 'tpl-1', config: {...}, cronExpression: '0 0 * * *', ... })
 * const list = repo.list(1, 20)
 * ```
 */
export class ScheduledTaskRepository extends BaseRepository<ScheduledTask> {
  /**
   * @param db - better-sqlite3 数据库连接
   */
  constructor(db: Database.Database) {
    super(db)
    this.prepareStatements()
  }

  /** 注册所有定时任务相关的预编译 SQL 语句 */
  prepareStatements(): void {
    this.setStmt(
      'scheduledTask.insert',
      this.db.prepare(
        'INSERT INTO scheduled_tasks (id, template_id, config, cron_expression, enabled, last_run, next_run, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
    )
    this.setStmt(
      'scheduledTask.getById',
      this.db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?')
    )
    this.setStmt(
      'scheduledTask.update',
      this.db.prepare(
        'UPDATE scheduled_tasks SET template_id=?, config=?, cron_expression=?, enabled=?, last_run=?, next_run=? WHERE id=?'
      )
    )
    this.setStmt(
      'scheduledTask.delete',
      this.db.prepare('DELETE FROM scheduled_tasks WHERE id = ?')
    )
  }

  /**
   * 将数据库行记录映射为 ScheduledTask 对象
   * 解析 JSON config 字段，将 enabled 从 INTEGER 转为 boolean。
   * @param row - 数据库查询返回的原始行数据
   * @returns 组装好的 ScheduledTask 实体
   */
  private rowToScheduledTask(row: Record<string, unknown>): ScheduledTask {
    return {
      id: row.id as string,
      templateId: row.template_id as string,
      config: this.fromJson<Record<string, unknown>>(row.config as string | null) ?? {},
      cronExpression: row.cron_expression as string,
      enabled: (row.enabled as number) === 1,
      lastRun: row.last_run as string | null,
      nextRun: row.next_run as string | null,
      createdAt: row.created_at as string
    }
  }

  /**
   * 创建定时任务
   * @param data - 定时任务数据
   * @returns 创建的 ScheduledTask 对象
   */
  create(data: Omit<ScheduledTask, 'id' | 'createdAt'>): ScheduledTask {
    const id = uuidv4()
    const createdAt = this.nowISO()
    this.stmt('scheduledTask.insert').run(
      id,
      data.templateId,
      this.toJson(data.config),
      data.cronExpression,
      data.enabled ? 1 : 0,
      data.lastRun ?? null,
      data.nextRun ?? null,
      createdAt
    )
    return this.get(id)!
  }

  /**
   * 根据 ID 获取定时任务
   * @param id - 定时任务 UUID
   * @returns ScheduledTask 对象，不存在时返回 null
   */
  get(id: string): ScheduledTask | null {
    const row = this.stmt('scheduledTask.getById').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToScheduledTask(row) : null
  }

  /**
   * 分页查询定时任务列表（支持按 Cron 表达式模糊搜索）
   * @param page     - 页码（默认 1）
   * @param pageSize - 每页条数（默认 20）
   * @param search   - 可选搜索关键词
   * @returns 分页结果
   */
  list(page = 1, pageSize = 20, search?: string): ListResponse<ScheduledTask> {
    if (search) {
      const countStmt = this.db.prepare(
        'SELECT COUNT(*) as cnt FROM scheduled_tasks WHERE cron_expression LIKE ?'
      )
      const listStmt = this.db.prepare(
        'SELECT * FROM scheduled_tasks WHERE cron_expression LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
      )
      return this.paginate(
        countStmt,
        listStmt,
        page,
        pageSize,
        (r) => this.rowToScheduledTask(r),
        [`%${search}%`]
      )
    }
    const countStmt = this.db.prepare('SELECT COUNT(*) as cnt FROM scheduled_tasks')
    const listStmt = this.db.prepare(
      'SELECT * FROM scheduled_tasks ORDER BY created_at DESC LIMIT ? OFFSET ?'
    )
    return this.paginate(countStmt, listStmt, page, pageSize, (r) => this.rowToScheduledTask(r))
  }

  /**
   * 更新定时任务
   * @param id   - 定时任务 UUID
   * @param data - 要更新的字段
   * @returns 更新后的 ScheduledTask 对象，不存在时返回 null
   */
  update(
    id: string,
    data: Partial<Omit<ScheduledTask, 'id' | 'createdAt'>>
  ): ScheduledTask | null {
    const existing = this.get(id)
    if (!existing) return null
    const updated = { ...existing, ...data }
    this.stmt('scheduledTask.update').run(
      updated.templateId,
      this.toJson(updated.config),
      updated.cronExpression,
      updated.enabled ? 1 : 0,
      updated.lastRun ?? null,
      updated.nextRun ?? null,
      id
    )
    return this.get(id)
  }

  /**
   * 删除定时任务
   * @param id - 定时任务 UUID
   * @returns 是否成功删除
   */
  delete(id: string): boolean {
    const result = this.stmt('scheduledTask.delete').run(id)
    return result.changes > 0
  }
}

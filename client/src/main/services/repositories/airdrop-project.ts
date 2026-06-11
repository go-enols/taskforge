/**
 * @file AirdropProjectRepository — 空投项目数据仓库
 * @description 封装 airdrop_projects 表的全部 CRUD 操作，支持分页查询、模糊搜索
 *              和分析统计。处理 links/tasks/earnings/tags/labels/customFields 等
 *              JSON 字段的自动序列化与反序列化。
 * @module main/services/repositories
 */
import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import type {
  AirdropProject,
  AirdropAnalytics,
  AirdropLink,
  EligibilityCriterion,
  AirdropTaskItem,
  Earning,
  ListResponse
} from '../../../shared/types'
import { BaseRepository } from './base'

/**
 * 空投项目数据仓库
 *
 * 管理空投项目的完整生命周期，支持项目信息、链接、任务、收益等
 * 多维数据的持久化和统计查询。
 *
 * @example
 * ```ts
 * const repo = new AirdropProjectRepository(db)
 * const project = repo.create({ name: 'Test Airdrop', ... })
 * const list = repo.list(1, 20, 'test')
 * const analytics = repo.getAnalytics()
 * ```
 */
export class AirdropProjectRepository extends BaseRepository<AirdropProject> {
  /**
   * @param db - better-sqlite3 数据库连接
   */
  constructor(db: Database.Database) {
    super(db)
    this.prepareStatements()
  }

  /** 注册所有空投项目相关的预编译 SQL 语句 */
  prepareStatements(): void {
    this.setStmt(
      'airdrop.insert',
      this.db.prepare(
        'INSERT INTO airdrop_projects (id, name, chain, status, project_type, description, website, script_template_id, account_pool, links, eligibility_criteria, tasks, earnings, tags, labels, template_id, custom_fields, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
    )
    this.setStmt(
      'airdrop.getById',
      this.db.prepare('SELECT * FROM airdrop_projects WHERE id = ?')
    )
    this.setStmt(
      'airdrop.update',
      this.db.prepare(
        'UPDATE airdrop_projects SET name=?, chain=?, status=?, project_type=?, description=?, website=?, script_template_id=?, account_pool=?, links=?, eligibility_criteria=?, tasks=?, earnings=?, tags=?, labels=?, template_id=?, custom_fields=?, updated_at=? WHERE id=?'
      )
    )
    this.setStmt('airdrop.delete', this.db.prepare('DELETE FROM airdrop_projects WHERE id = ?'))
  }

  /**
   * 将数据库行记录映射为 AirdropProject 对象
   * 反序列化 links/tasks/earnings/tags/labels 等 JSON 字段。
   * @param row - 数据库查询返回的原始行数据
   * @returns 组装好的 AirdropProject 实体
   */
  private rowToAirdropProject(row: Record<string, unknown>): AirdropProject {
    return {
      id: row.id as string,
      name: row.name as string,
      chain: row.chain as string,
      status: row.status as AirdropProject['status'],
      projectType: row.project_type as AirdropProject['projectType'],
      description: row.description as string,
      website: row.website as string,
      scriptTemplateId: row.script_template_id as string | undefined,
      accountPool: row.account_pool as string,
      links: this.fromJsonArray<AirdropLink>(row.links as string | null),
      eligibilityCriteria: this.fromJsonArray<EligibilityCriterion>(row.eligibility_criteria as string | null),
      tasks: this.fromJsonArray<AirdropTaskItem>(row.tasks as string | null),
      earnings: this.fromJsonArray<Earning>(row.earnings as string | null),
      tags: this.fromJsonArray<string>(row.tags as string | null),
      labels: this.fromJsonArray<string>(row.labels as string | null),
      templateId: (row.template_id as string | null) ?? undefined,
      customFields: this.fromJson<Record<string, unknown>>(row.custom_fields as string | null) ?? {},
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string
    }
  }

  /**
   * 创建空投项目
   * @param data - 空投项目数据（links/tasks/earnings/tags/labels 等 JSON 字段自动序列化）
   * @returns 创建的 AirdropProject 对象
   */
  create(data: Omit<AirdropProject, 'id' | 'createdAt' | 'updatedAt'>): AirdropProject {
    const id = uuidv4()
    const now = this.nowISO()
    this.stmt('airdrop.insert').run(
      id,
      data.name,
      data.chain,
      data.status,
      data.projectType,
      data.description,
      data.website,
      data.scriptTemplateId ?? null,
      data.accountPool,
      this.toJson(data.links),
      this.toJson(data.eligibilityCriteria),
      this.toJson(data.tasks),
      this.toJson(data.earnings),
      this.toJson(data.tags),
      this.toJson(data.labels),
      data.templateId ?? null,
      this.toJson(data.customFields ?? {}),
      now,
      now
    )
    return this.get(id)!
  }

  /**
   * 根据 ID 获取空投项目
   * @param id - 空投项目 UUID
   * @returns AirdropProject 对象，不存在时返回 null
   */
  get(id: string): AirdropProject | null {
    const row = this.stmt('airdrop.getById').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToAirdropProject(row) : null
  }

  /**
   * 分页查询空投项目列表（支持按名称/描述/标签模糊搜索）
   * @param page     - 页码（默认 1）
   * @param pageSize - 每页条数（默认 20）
   * @param search   - 可选搜索关键词
   * @returns 分页结果
   */
  list(page = 1, pageSize = 20, search?: string): ListResponse<AirdropProject> {
    if (search) {
      const countStmt = this.db.prepare(
        'SELECT COUNT(*) as cnt FROM airdrop_projects WHERE name LIKE ? OR description LIKE ? OR tags LIKE ?'
      )
      const listStmt = this.db.prepare(
        'SELECT * FROM airdrop_projects WHERE name LIKE ? OR description LIKE ? OR tags LIKE ? ORDER BY updated_at DESC LIMIT ? OFFSET ?'
      )
      return this.paginate(
        countStmt,
        listStmt,
        page,
        pageSize,
        (r) => this.rowToAirdropProject(r),
        [`%${search}%`, `%${search}%`, `%${search}%`]
      )
    }
    const countStmt = this.db.prepare('SELECT COUNT(*) as cnt FROM airdrop_projects')
    const listStmt = this.db.prepare(
      'SELECT * FROM airdrop_projects ORDER BY updated_at DESC LIMIT ? OFFSET ?'
    )
    return this.paginate(countStmt, listStmt, page, pageSize, (r) => this.rowToAirdropProject(r))
  }

  /**
   * 更新空投项目
   * @param id   - 空投项目 UUID
   * @param data - 要更新的字段（links/tasks/earnings/tags/labels 自动序列化）
   * @returns 更新后的 AirdropProject 对象，不存在时返回 null
   */
  update(
    id: string,
    data: Partial<Omit<AirdropProject, 'id' | 'createdAt' | 'updatedAt'>>
  ): AirdropProject | null {
    const existing = this.get(id)
    if (!existing) return null
    const updated = { ...existing, ...data, updatedAt: this.nowISO() }
    this.stmt('airdrop.update').run(
      updated.name,
      updated.chain,
      updated.status,
      updated.projectType,
      updated.description,
      updated.website,
      updated.scriptTemplateId ?? null,
      updated.accountPool,
      this.toJson(updated.links),
      this.toJson(updated.eligibilityCriteria),
      this.toJson(updated.tasks),
      this.toJson(updated.earnings),
      this.toJson(updated.tags),
      this.toJson(updated.labels),
      updated.templateId ?? null,
      this.toJson(updated.customFields ?? {}),
      updated.updatedAt,
      id
    )
    return this.get(id)
  }

  /**
   * 删除空投项目
   * @param id - 空投项目 UUID
   * @returns 是否成功删除
   */
  delete(id: string): boolean {
    const result = this.stmt('airdrop.delete').run(id)
    return result.changes > 0
  }

  /**
   * 获取空投分析数据
   *
   * 统计各状态数量、总收益估算、代币分布和即将到期列表。
   *
   * @returns AirdropAnalytics 分析结果
   */
  getAnalytics(): AirdropAnalytics {
    const countByStatus = this.db
      .prepare('SELECT status, COUNT(*) as cnt FROM airdrop_projects GROUP BY status')
      .all() as Array<{ status: string; cnt: number }>
    const counts: Record<string, number> = {
      ongoing: 0,
      completed: 0,
      cancelled: 0,
      claimed: 0
    }
    for (const row of countByStatus) {
      counts[row.status] = row.cnt
    }

    const totalAirdrops = (counts.ongoing + counts.completed + counts.cancelled + counts.claimed)
    const allRows = this.db
      .prepare('SELECT id, name, earnings, tasks FROM airdrop_projects')
      .all() as Array<{ id: string; name: string; earnings: string | null; tasks: string | null }>

    let totalEarningsValueUsd = 0
    const tokenMap = new Map<string, { amount: number; valueUsd: number }>()
    const deadlineEntries: Array<{ taskId: string; projectName: string; taskTitle: string; deadline: string }> = []

    for (const row of allRows) {
      const earnings = this.fromJsonArray<Earning>(row.earnings)
      for (const e of earnings) {
        if (e.token && e.amount) {
          const prev = tokenMap.get(e.token) ?? { amount: 0, valueUsd: 0 }
          tokenMap.set(e.token, {
            amount: prev.amount + (e.amount ?? 0),
            valueUsd: prev.valueUsd + (e.valueUsd ?? 0)
          })
        }
        if (e.valueUsd) {
          totalEarningsValueUsd += e.valueUsd
        }
      }

      const tasks = this.fromJsonArray<AirdropTaskItem>(row.tasks)
      for (const t of tasks) {
        if (t.deadline && t.deadline.trim()) {
          deadlineEntries.push({
            taskId: t.id,
            projectName: row.name,
            taskTitle: t.title || t.description || '',
            deadline: t.deadline
          })
        }
      }
    }

    const tokenEarnings = [...tokenMap.entries()]
      .map(([token, v]) => ({ token, totalAmount: v.amount, totalValueUsd: v.valueUsd }))
      .sort((a, b) => {
        if (b.totalValueUsd !== a.totalValueUsd) return b.totalValueUsd - a.totalValueUsd
        return b.totalAmount - a.totalAmount
      })

    const upcomingDeadlines = deadlineEntries
      .sort((a, b) => a.deadline.localeCompare(b.deadline))
      .slice(0, 5)

    return {
      totalAirdrops,
      ongoingCount: counts.ongoing,
      completedCount: counts.completed,
      claimedCount: counts.claimed,
      cancelledCount: counts.cancelled,
      totalEarningsValueUsd,
      tokenEarnings,
      upcomingDeadlines
    }
  }
}

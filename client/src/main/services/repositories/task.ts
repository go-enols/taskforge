/**
 * @file TaskRepository — 任务数据仓库
 * @description 封装 tasks 表和 task_logs 表的全部 CRUD 操作，支持任务状态统计、
 *              最近完成记录、时间线分析和周趋势统计等 Dashboard 数据分析功能。
 * @module main/services/repositories
 */
import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import type {
  Task,
  TaskLog,
  ListResponse,
  TaskTimelineEntry,
  RecentTaskResult,
  WeeklyTrend
} from '../../../shared/types'
import { BaseRepository } from './base'

/** 最近完成的任务查询 SQL（按结束时间降序） */
const TASK_RECENT_FINISHED_SQL =
  "SELECT * FROM tasks WHERE status IN ('complete','error','stopped') ORDER BY ended_at DESC LIMIT ?"

/** 每日任务时间线统计 SQL（启动数、完成数、失败数） */
const TASK_TIMELINE_SQL =
  "SELECT DATE(started_at) as date, COUNT(CASE WHEN status='running' OR started_at IS NOT NULL THEN 1 END) as started, COUNT(CASE WHEN status='complete' THEN 1 END) as completed, COUNT(CASE WHEN status='error' THEN 1 END) as failed FROM tasks WHERE started_at IS NOT NULL AND started_at >= ? GROUP BY DATE(started_at) ORDER BY date"

/** 每周任务趋势统计 SQL（按 ISO 周分组） */
const TASK_WEEKLY_TREND_SQL =
  "SELECT strftime('%Y-%W', started_at) as week_start, COUNT(CASE WHEN started_at IS NOT NULL THEN 1 END) as started, COUNT(CASE WHEN status='complete' THEN 1 END) as completed, COUNT(CASE WHEN status='error' THEN 1 END) as failed FROM tasks WHERE started_at IS NOT NULL AND started_at >= ? GROUP BY strftime('%Y-%W', started_at) ORDER BY week_start"

/**
 * 任务数据仓库
 *
 * 管理任务的持久化、日志记录和统计分析。
 * 任务支持 idle / running / paused / stopped / complete / error 六种状态，
 * 关联 task_logs 表记录运行时日志，提供 Dashboard 所需的时间线和趋势数据。
 *
 * @example
 * ```ts
 * const repo = new TaskRepository(db)
 * const task = repo.createTask({ scriptFolder: '/scripts/test', ... })
 * repo.addTaskLog(task.id, 'info', 'Task started')
 * const timeline = repo.getTimeline('2025-01-01')
 * ```
 */
export class TaskRepository extends BaseRepository<Task> {
  /**
   * @param db - better-sqlite3 数据库连接
   */
  constructor(db: Database.Database) {
    super(db)
    this.prepareStatements()
  }

  /** 注册所有任务相关的预编译 SQL 语句 */
  prepareStatements(): void {
    this.setStmt(
      'task.insert',
      this.db.prepare(
        'INSERT INTO tasks (id, script_folder, config, status, worker_id, started_at, ended_at, is_sandbox) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
    )
    this.setStmt('task.getById', this.db.prepare('SELECT * FROM tasks WHERE id = ?'))
    this.setStmt(
      'task.update',
      this.db.prepare(
        'UPDATE tasks SET script_folder=?, config=?, status=?, worker_id=?, started_at=?, ended_at=?, is_sandbox=? WHERE id=?'
      )
    )
    this.setStmt('task.delete', this.db.prepare('DELETE FROM tasks WHERE id = ?'))
    this.setStmt(
      'taskLog.deleteByTaskId',
      this.db.prepare('DELETE FROM task_logs WHERE task_id = ?')
    )
    this.setStmt('task.count', this.db.prepare('SELECT COUNT(*) as cnt FROM tasks'))
    this.setStmt(
      'task.countByStatus',
      this.db.prepare('SELECT status, COUNT(*) as cnt FROM tasks GROUP BY status')
    )
    this.setStmt('task.recentFinished', this.db.prepare(TASK_RECENT_FINISHED_SQL))
    this.setStmt('task.timeline', this.db.prepare(TASK_TIMELINE_SQL))
    this.setStmt('task.weeklyTrend', this.db.prepare(TASK_WEEKLY_TREND_SQL))

    // 任务日志表预编译语句
    this.setStmt(
      'taskLog.insert',
      this.db.prepare(
        'INSERT INTO task_logs (task_id, timestamp, level, message) VALUES (?, ?, ?, ?)'
      )
    )
    this.setStmt(
      'taskLog.getByTaskId',
      this.db.prepare('SELECT * FROM task_logs WHERE task_id = ? ORDER BY id DESC LIMIT ?')
    )
    this.setStmt('taskLog.clearAll', this.db.prepare('DELETE FROM task_logs'))
    this.setStmt('taskLog.count', this.db.prepare('SELECT COUNT(*) as cnt FROM task_logs'))
  }

  /**
   * 将数据库行记录映射为 Task 对象
   * 解析 JSON 配置字段，将 is_sandbox 从 INTEGER 转为 boolean。
   * @param row - 数据库查询返回的原始行数据
   * @returns 组装好的 Task 实体
   */
  private rowToTask(row: Record<string, unknown>): Task {
    return {
      id: row.id as string,
      scriptFolder: row.script_folder as string,
      config: this.fromJson<Record<string, unknown>>(row.config as string | null) ?? {},
      status: row.status as Task['status'],
      workerId: row.worker_id as string | null,
      startedAt: row.started_at as string | null,
      endedAt: row.ended_at as string | null,
      isSandbox: (row.is_sandbox as number) === 1
    }
  }

  /**
   * 将数据库行记录映射为 TaskLog 对象
   * @param row - 数据库查询返回的原始行数据
   * @returns 组装好的 TaskLog 实体
   */
  private rowToTaskLog(row: Record<string, unknown>): TaskLog {
    return {
      id: row.id as number,
      taskId: row.task_id as string,
      timestamp: row.timestamp as string,
      level: row.level as TaskLog['level'],
      message: row.message as string
    }
  }

  /** 获取任务总数 */
  count(): number {
    return (this.stmt('task.count').get() as Record<string, number>).cnt
  }

  /**
   * 按状态统计任务数量
   * @returns 状态名 → 数量的映射，如 { running: 2, idle: 10, complete: 50 }
   */
  countByStatus(): Record<string, number> {
    const rows = this.stmt('task.countByStatus').all() as Record<string, unknown>[]
    const result: Record<string, number> = {}
    for (const row of rows) {
      result[row.status as string] = row.cnt as number
    }
    return result
  }

  /** 获取任务日志总数 */
  countTaskLogs(): number {
    return (this.stmt('taskLog.count').get() as Record<string, number>).cnt
  }

  /**
   * 获取最近完成的任务列表（含运行时长）
   * 用于 Dashboard 最近动态展示。
   * @param limit - 返回条数上限
   * @returns 最近完成的任务摘要数组，包含 durationSecs 字段
   */
  getRecentFinished(limit: number): RecentTaskResult[] {
    const rows = this.stmt('task.recentFinished').all(limit) as Record<string, unknown>[]
    return rows.map((row) => {
      const startedAt = row.started_at as string | null
      const endedAt = row.ended_at as string | null
      let durationSecs: number | null = null
      if (startedAt && endedAt) {
        durationSecs =
          Math.round(((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000) * 100) /
          100
      }
      return {
        id: row.id as string,
        scriptFolder: row.script_folder as string,
        status: row.status as string,
        startedAt,
        endedAt,
        durationSecs
      }
    })
  }

  /**
   * 获取每日任务时间线
   * 统计指定日期以来每天的任务启动数、完成数和失败数。
   * @param since - 起始日期（ISO 8601 字符串）
   * @returns 每日统计条目数组
   */
  getTimeline(since: string): TaskTimelineEntry[] {
    const rows = this.stmt('task.timeline').all(since) as Record<string, unknown>[]
    return rows.map((row) => ({
      date: row.date as string,
      started: row.started as number,
      completed: row.completed as number,
      failed: row.failed as number
    }))
  }

  /**
   * 获取每周任务趋势
   * 按 ISO 周分组统计任务启动数、完成数和失败数。
   * @param since - 起始日期（ISO 8601 字符串）
   * @returns 每周统计条目数组
   */
  getWeeklyTrend(since: string): WeeklyTrend[] {
    const rows = this.stmt('task.weeklyTrend').all(since) as Record<string, unknown>[]
    return rows.map((row) => ({
      weekStart: row.week_start as string,
      started: row.started as number,
      completed: row.completed as number,
      failed: row.failed as number
    }))
  }

  /**
   * 创建新任务
   * 自动生成 UUID，is_sandbox 转换为 INTEGER 存储。
   * @param data - 任务数据（不含 id）
   * @returns 创建完成的 Task 实体
   */
  createTask(data: Omit<Task, 'id'>): Task {
    const id = uuidv4()
    this.stmt('task.insert').run(
      id,
      data.scriptFolder,
      this.toJson(data.config),
      data.status,
      data.workerId ?? null,
      data.startedAt ?? null,
      data.endedAt ?? null,
      data.isSandbox ? 1 : 0
    )
    return this.getTask(id)!
  }

  /**
   * 根据 ID 获取任务
   * @param id - 任务 UUID
   * @returns Task 实体，未找到时返回 null
   */
  getTask(id: string): Task | null {
    const row = this.stmt('task.getById').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToTask(row) : null
  }

  /**
   * 分页查询任务列表
   * 支持按脚本路径或状态模糊搜索，按 ID 降序排列（最新优先）。
   * @param page - 页码（从 1 开始，默认 1）
   * @param pageSize - 每页条数（默认 20）
   * @param search - 可选搜索关键词（匹配 script_folder 或 status）
   * @returns 分页响应，包含 items 和分页元信息
   */
  listTasks(page = 1, pageSize = 20, search?: string): ListResponse<Task> {
    if (search) {
      const countStmt = this.db.prepare(
        'SELECT COUNT(*) as cnt FROM tasks WHERE script_folder LIKE ? OR status LIKE ?'
      )
      const listStmt = this.db.prepare(
        'SELECT * FROM tasks WHERE script_folder LIKE ? OR status LIKE ? ORDER BY id DESC LIMIT ? OFFSET ?'
      )
      return this.paginate(countStmt, listStmt, page, pageSize, (r) => this.rowToTask(r), [
        `%${search}%`,
        `%${search}%`
      ])
    }
    const countStmt = this.stmt('task.count')
    const listStmt = this.db.prepare('SELECT * FROM tasks ORDER BY id DESC LIMIT ? OFFSET ?')
    return this.paginate(countStmt, listStmt, page, pageSize, (r) => this.rowToTask(r))
  }

  /**
   * 更新任务信息
   * 合并新数据到现有任务记录，is_sandbox 自动转换为 INTEGER。
   * @param id - 任务 UUID
   * @param data - 需要更新的字段（部分更新）
   * @returns 更新后的 Task 实体，任务不存在时返回 null
   */
  updateTask(id: string, data: Partial<Omit<Task, 'id'>>): Task | null {
    const existing = this.getTask(id)
    if (!existing) return null
    const updated = { ...existing, ...data }
    this.stmt('task.update').run(
      updated.scriptFolder,
      this.toJson(updated.config),
      updated.status,
      updated.workerId ?? null,
      updated.startedAt ?? null,
      updated.endedAt ?? null,
      updated.isSandbox ? 1 : 0,
      id
    )
    return this.getTask(id)
  }

  /**
   * 删除单个任务
   *
   * 在同一事务内先删除其全部 task_logs，再删除任务本身，避免产生无法再查询的
   * 永久孤儿日志（task_logs 表未声明外键级联）。
   *
   * @param id - 任务 UUID
   * @returns 是否删除成功
   */
  deleteTask(id: string): boolean {
    const removeTaskWithLogs = this.db.transaction((taskId: string): boolean => {
      this.stmt('taskLog.deleteByTaskId').run(taskId)
      const result = this.stmt('task.delete').run(taskId)
      return result.changes > 0
    })
    return removeTaskWithLogs(id)
  }

  /**
   * 添加任务日志条目
   * 自动记录当前时间戳。
   * @param taskId - 关联的任务 UUID
   * @param level - 日志级别（info / warn / error / debug）
   * @param message - 日志内容
   */
  addTaskLog(taskId: string, level: string, message: string): void {
    this.stmt('taskLog.insert').run(taskId, this.nowISO(), level, message)
  }

  /**
   * 获取任务的日志条目
   * 按 ID 降序返回（最新的在前），默认最多 100 条。
   * @param taskId - 任务 UUID
   * @param limit - 返回条数上限（默认 100）
   * @returns TaskLog 数组
   */
  getTaskLogs(taskId: string, limit = 100): TaskLog[] {
    const rows = this.stmt('taskLog.getByTaskId').all(taskId, limit) as Record<string, unknown>[]
    return rows.map((r) => this.rowToTaskLog(r))
  }

  /**
   * 清除任务日志
   * 如果指定 taskId 则只清除该任务的日志，否则清除所有日志。
   * @param taskId - 可选的任务 UUID，为空时清空所有日志
   * @returns 被删除的日志条数
   */
  clearTaskLogs(taskId?: string): number {
    if (taskId) {
      const stmt = this.db.prepare('DELETE FROM task_logs WHERE task_id = ?')
      const result = stmt.run(taskId)
      return result.changes
    }
    const count = (this.stmt('taskLog.count').get() as Record<string, number>).cnt
    this.stmt('taskLog.clearAll').run()
    return count
  }
}

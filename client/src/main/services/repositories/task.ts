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

const TASK_RECENT_FINISHED_SQL =
  "SELECT * FROM tasks WHERE status IN ('complete','error','stopped') ORDER BY ended_at DESC LIMIT ?"
const TASK_TIMELINE_SQL =
  "SELECT DATE(started_at) as date, COUNT(CASE WHEN status='running' OR started_at IS NOT NULL THEN 1 END) as started, COUNT(CASE WHEN status='complete' THEN 1 END) as completed, COUNT(CASE WHEN status='error' THEN 1 END) as failed FROM tasks WHERE started_at IS NOT NULL AND started_at >= ? GROUP BY DATE(started_at) ORDER BY date"
const TASK_WEEKLY_TREND_SQL =
  "SELECT strftime('%Y-%W', started_at) as week_start, COUNT(CASE WHEN started_at IS NOT NULL THEN 1 END) as started, COUNT(CASE WHEN status='complete' THEN 1 END) as completed, COUNT(CASE WHEN status='error' THEN 1 END) as failed FROM tasks WHERE started_at IS NOT NULL AND started_at >= ? GROUP BY strftime('%Y-%W', started_at) ORDER BY week_start"

export class TaskRepository extends BaseRepository<Task> {
  constructor(db: Database.Database) {
    super(db)
    this.prepareStatements()
  }

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
    this.setStmt('task.count', this.db.prepare('SELECT COUNT(*) as cnt FROM tasks'))
    this.setStmt(
      'task.countByStatus',
      this.db.prepare('SELECT status, COUNT(*) as cnt FROM tasks GROUP BY status')
    )
    this.setStmt('task.recentFinished', this.db.prepare(TASK_RECENT_FINISHED_SQL))
    this.setStmt('task.timeline', this.db.prepare(TASK_TIMELINE_SQL))
    this.setStmt('task.weeklyTrend', this.db.prepare(TASK_WEEKLY_TREND_SQL))

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

  private rowToTaskLog(row: Record<string, unknown>): TaskLog {
    return {
      id: row.id as number,
      taskId: row.task_id as string,
      timestamp: row.timestamp as string,
      level: row.level as TaskLog['level'],
      message: row.message as string
    }
  }

  count(): number {
    return (this.stmt('task.count').get() as Record<string, number>).cnt
  }

  countByStatus(): Record<string, number> {
    const rows = this.stmt('task.countByStatus').all() as Record<string, unknown>[]
    const result: Record<string, number> = {}
    for (const row of rows) {
      result[row.status as string] = row.cnt as number
    }
    return result
  }

  countTaskLogs(): number {
    return (this.stmt('taskLog.count').get() as Record<string, number>).cnt
  }

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

  getTimeline(since: string): TaskTimelineEntry[] {
    const rows = this.stmt('task.timeline').all(since) as Record<string, unknown>[]
    return rows.map((row) => ({
      date: row.date as string,
      started: row.started as number,
      completed: row.completed as number,
      failed: row.failed as number
    }))
  }

  getWeeklyTrend(since: string): WeeklyTrend[] {
    const rows = this.stmt('task.weeklyTrend').all(since) as Record<string, unknown>[]
    return rows.map((row) => ({
      weekStart: row.week_start as string,
      started: row.started as number,
      completed: row.completed as number,
      failed: row.failed as number
    }))
  }

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

  getTask(id: string): Task | null {
    const row = this.stmt('task.getById').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToTask(row) : null
  }

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

  deleteTask(id: string): boolean {
    const result = this.stmt('task.delete').run(id)
    return result.changes > 0
  }

  addTaskLog(taskId: string, level: string, message: string): void {
    this.stmt('taskLog.insert').run(taskId, this.nowISO(), level, message)
  }

  getTaskLogs(taskId: string, limit = 100): TaskLog[] {
    const rows = this.stmt('taskLog.getByTaskId').all(taskId, limit) as Record<string, unknown>[]
    return rows.map((r) => this.rowToTaskLog(r))
  }

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

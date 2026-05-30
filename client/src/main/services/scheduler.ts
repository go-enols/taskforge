import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { StoreService } from './store'
import { TaskService } from './task'
import { createLogger } from '../utils/logger'
import type { ScheduledTask } from '../../shared/types'

const logger = createLogger('scheduler-service')

function matchesCron(expr: string, now: Date): boolean {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return false
  const [min, hour, dom, month, dow] = parts

  const current = {
    minute: now.getMinutes(),
    hour: now.getHours(),
    dom: now.getDate(),
    month: now.getMonth() + 1,
    dow: now.getDay()
  }

  return (
    matchField(min, current.minute) &&
    matchField(hour, current.hour) &&
    matchField(dom, current.dom) &&
    matchField(month, current.month) &&
    matchField(dow, current.dow)
  )
}

function matchField(pattern: string, value: number): boolean {
  if (pattern === '*') return true
  for (const part of pattern.split(',')) {
    if (part.includes('/')) {
      const [base, step] = part.split('/')
      const b = base === '*' ? 0 : parseInt(base, 10)
      const s = parseInt(step, 10)
      if (isNaN(s)) continue
      if (base === '*') {
        if (value % s === 0) return true
      } else {
        if (value >= b && (value - b) % s === 0) return true
      }
    } else if (part.includes('-')) {
      const [lo, hi] = part.split('-').map(Number)
      if (!isNaN(lo) && !isNaN(hi) && value >= lo && value <= hi) return true
    } else {
      const n = parseInt(part, 10)
      if (!isNaN(n) && value === n) return true
    }
  }
  return false
}

function nextCronTime(expr: string, from: Date): Date | null {
  const next = new Date(from)
  for (let i = 1; i <= 525600; i++) {
    next.setMinutes(next.getMinutes() + 1)
    if (matchesCron(expr, next)) return next
  }
  return null
}

export class SchedulerService {
  private store: StoreService
  private taskService: TaskService
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(store: StoreService, taskService: TaskService) {
    this.store = store
    this.taskService = taskService
  }

  start(): void {
    if (this.timer) return
    logger.info('Scheduler service started')
    this.timer = setInterval(() => this.tick(), 10000)
    this.tick()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    logger.info('Scheduler service stopped')
  }

  private tick(): void {
    try {
      const res = this.store.listScheduledTasks(1, 9999)
      if (!res?.items) return
      const now = new Date()
      for (const st of res.items) {
        if (!st.enabled) continue
        if (!matchesCron(st.cronExpression, now)) continue
        // Use persisted lastRun for dedup so restarts don't re-fire already-executed schedules
        const lastMs = st.lastRun ? new Date(st.lastRun).getTime() : 0
        if (now.getTime() - lastMs < 55000) continue

        const nextRun = nextCronTime(st.cronExpression, now)
        this.store.updateScheduledTask(st.id, {
          lastRun: now.toISOString(),
          nextRun: nextRun?.toISOString() ?? null
        })
        this.fire(st)
      }
    } catch (err) {
      logger.warn('Scheduler tick error', { error: String(err) })
    }
  }

  private async fire(st: ScheduledTask): Promise<void> {
    try {
      const tpl = this.store.getTaskTemplate(st.templateId)
      if (!tpl || !tpl.isInstalled) {
        logger.warn('Scheduled task has no installed script', {
          id: st.id,
          templateId: st.templateId
        })
        return
      }
      if (!existsSync(tpl.installPath)) {
        logger.warn('Scheduled task script directory missing on disk', {
          id: st.id,
          path: tpl.installPath
        })
        return
      }
      let entryFile = join(tpl.installPath, 'index.js')
      const metaPath = join(tpl.installPath, 'meta.json')
      if (existsSync(metaPath)) {
        try {
          const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as Record<string, unknown>
          if (meta.entryPoint && typeof meta.entryPoint === 'string') {
            entryFile = join(tpl.installPath, meta.entryPoint)
          }
        } catch {
          /* ignore */
        }
      }
      if (!existsSync(entryFile)) {
        logger.warn('Scheduled task entry point missing on disk', { id: st.id, path: entryFile })
        return
      }
      const task = this.store.taskRepo.createTask({
        scriptFolder: tpl.installPath,
        config: st.config ?? {},
        status: 'idle',
        workerId: null,
        startedAt: null,
        endedAt: null,
        isSandbox: false
      })
      await this.taskService.startTask(task.id)
      logger.info('Scheduled task fired', { id: st.id, taskId: task.id })
    } catch (err) {
      logger.warn('Failed to fire scheduled task', { id: st.id, error: String(err) })
    }
  }
}

/**
 * @file SchedulerService — 定时任务调度服务
 * @description 基于 Cron 表达式的定时任务调度引擎，定期检查数据库中启用的定时任务，
 *              匹配当前时间后自动触发任务执行。内部实现简易的 5 字段 Cron 解析器。
 * @module main/services
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { StoreService } from './store'
import { TaskService } from './task'
import { createLogger } from '../utils/logger'
import type { ScheduledTask } from '../../shared/types'

const logger = createLogger('scheduler-service')

/** 内部 Cron 匹配函数：检查给定时间是否匹配 5 字段 Cron 表达式 */
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

/** 内部辅助函数：判断单个字段值是否匹配 Cron 模式（支持 *, /, - 和逗号分隔） */
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

/**
 * 计算下一个匹配 Cron 表达式的时间
 *
 * 从给定时间开始逐分钟递增（最多 525600 分钟 ≈ 1 年），
 * 找到第一个匹配的时间点。用于更新定时任务的 nextRun 字段。
 *
 * @param expr - Cron 表达式（5 字段: 分 时 日 月 周）
 * @param from - 起始时间
 * @returns 下一个匹配的时间，一年内无匹配则返回 null
 */
function nextCronTime(expr: string, from: Date): Date | null {
  const next = new Date(from)
  for (let i = 1; i <= 525600; i++) {
    next.setMinutes(next.getMinutes() + 1)
    if (matchesCron(expr, next)) return next
  }
  return null
}

/**
 * 定时任务调度服务
 *
 * 以 10 秒为周期轮询数据库中的定时任务列表，对每个启用的任务：
 * 1. 检查当前时间是否匹配其 Cron 表达式
 * 2. 检查距离上次执行是否超过 55 秒（防重复触发）
 * 3. 更新 lastRun / nextRun 时间戳
 * 4. 调用 TaskService.startTask 执行任务
 *
 * @example
 * ```ts
 * const scheduler = new SchedulerService(store, taskService)
 * scheduler.start()
 * // ... 应用退出时
 * scheduler.stop()
 * ```
 */
export class SchedulerService {
  private store: StoreService
  private taskService: TaskService
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(store: StoreService, taskService: TaskService) {
    this.store = store
    this.taskService = taskService
  }

  /** 启动调度器：开始周期性 tick 轮询（每 10 秒） */
  start(): void {
    if (this.timer) return
    logger.info('Scheduler service started')
    this.timer = setInterval(() => this.tick(), 10000)
    this.tick()
  }

  /** 停止调度器：清除定时器并释放资源 */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    logger.info('Scheduler service stopped')
  }

  /** 调度器周期核心逻辑：检查所有启用的定时任务，匹配 Cron 则触发执行 */
  private tick(): void {
    try {
      const res = this.store.listScheduledTasks(1, 9999)
      if (!res?.items) return
      const now = new Date()
      for (const st of res.items) {
        if (!st.enabled) continue
        if (!matchesCron(st.cronExpression, now)) continue

        // 防重复触发：距上次执行不足 55 秒时跳过
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

  /**
   * 执行定时任务：创建任务实例并启动
   *
   * 1. 根据 templateId 查询已安装的脚本模板
   * 2. 检查脚本目录和入口文件是否存在
   * 3. 从 meta.json 读取入口文件名
   * 4. 创建 Task 记录（isSandbox=false）
   * 5. 调用 TaskService.startTask 启动
   */
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

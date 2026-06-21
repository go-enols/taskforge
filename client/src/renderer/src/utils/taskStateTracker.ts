/**
 * @file taskStateTracker — 模块级任务状态跟踪器
 * @description 在渲染进程生命周期内持久监听主进程推送的任务事件，
 *              与 React 组件生命周期解耦。初始化后自动收集所有任务的
 *              状态变更、实时日志和输出，组件通过 React Hook 读取。
 *
 * @usage
 * 1. 在 main.tsx 渲染前调用 initTaskStateTracker()
 * 2. 任意组件通过 useTaskState() 获取响应式状态快照
 */
import type { TaskStatus, TaskLog, TaskOutput } from '../../../shared/types'

// ─── 模块级状态存储（组件卸载后依然存活） ───────────────────────

/** 任务最新状态映射 */
const taskStatusMap = new Map<string, TaskStatus>()

/** 任务进度映射 */
const taskProgressMap = new Map<string, { percent: number; message: string }>()

/** 已完成任务的输出 */
const taskOutputMap = new Map<string, TaskOutput>()

/**
 * 任务实时日志缓冲区（按 taskId 分组，上限 500 条/task）
 * 注意：taskId 是展开时才关心的，但日志推送是全局的；
 * 用 Map 存所有任务的日志以备展开时拼接
 */
interface StoredLog {
  id: number
  taskId: string
  timestamp: string
  level: TaskLog['level']
  message: string
}
const taskLogBuffers = new Map<string, StoredLog[]>()

/**
 * 日志自增 ID 计数器（按全局顺序递增）
 * 与新日志从 DB 加载的负 ID 区分，确保唯一性
 */
let logSeqId = 0

/** 版本计数器 — 每次状态更新时递增，用于 React 依赖追踪 */
let version = 0

/** 订阅者通知回调集合 */
type Subscriber = () => void
const subscribers = new Set<Subscriber>()

// ─── 内部辅助 ─────────────────────────────────────────────────

/** 通知所有订阅者 */
function notify(): void {
  version++
  for (const cb of subscribers) {
    try {
      cb()
    } catch {
      // 防止单个订阅者抛异常影响其他订阅者
    }
  }
}

/**
 * 追加日志到缓冲区
 * @param taskId - 任务 ID
 * @param logs - 日志条目数组
 */
function appendLogs(
  taskId: string,
  logs: Array<{ level: string; message: string; timestamp: string }>
): void {
  let buf = taskLogBuffers.get(taskId)
  if (!buf) {
    buf = []
    taskLogBuffers.set(taskId, buf)
  }
  for (const l of logs) {
    buf.push({
      id: --logSeqId,
      taskId,
      timestamp: l.timestamp,
      level: l.level as TaskLog['level'],
      message: l.message
    })
  }
  // 上限 500
  if (buf.length > 500) {
    taskLogBuffers.set(taskId, buf.slice(-500))
  }
}

// ─── 初始化（应用启动时调用一次） ─────────────────────────────

/** 是否已初始化 */
let initialized = false

/**
 * 初始化任务状态跟踪器
 *
 * 在 main.tsx 渲染前调用一次，注册所有 IPC 监听器。
 * 监听器在渲染进程整个生命周期内保持活跃，不会因页面切换而丢失。
 */
export function initTaskStateTracker(): void {
  if (initialized) return
  initialized = true

  if (!window.electronAPI?.on) {
    console.warn('[TaskStateTracker] electronAPI.on not available, skipping')
    return
  }

  // ── task:statusChanged — 任务状态变更 ──
  window.electronAPI.on('task:statusChanged', (rawData) => {
    const data = rawData as { id: string; status: string }
    if (data?.id && data?.status) {
      taskStatusMap.set(data.id, data.status as TaskStatus)
      notify()
    }
  })

  // ── task:log — 实时日志 ──
  window.electronAPI.on('task:log', (rawData) => {
    const data = rawData as {
      taskId: string
      logs: Array<{ level: string; message: string; timestamp: string }>
    }
    if (data?.taskId && Array.isArray(data.logs)) {
      appendLogs(data.taskId, data.logs)
      notify()
    }
  })

  // ── task:output — 任务完成输出 ──
  window.electronAPI.on('task:output', (rawData) => {
    const data = rawData as { taskId: string } & Record<string, unknown>
    if (data?.taskId) {
      taskOutputMap.set(data.taskId, data as unknown as TaskOutput)
      notify()
    }
  })
}

// ─── 公开 API ──────────────────────────────────────────────────

/** 获取任务的最新状态（从内存，比 DB 查询快） */
export function getTaskStatus(taskId: string): TaskStatus | undefined {
  return taskStatusMap.get(taskId)
}

/** 获取任务的实时日志缓冲区 */
export function getTaskLogBuffer(taskId: string): StoredLog[] {
  return taskLogBuffers.get(taskId) ?? []
}

/** 获取任务已完成输出 */
export function getTaskOutput(taskId: string): TaskOutput | undefined {
  return taskOutputMap.get(taskId)
}

/** 获取当前所有任务状态快照（只读 Map） */
export function getStatusMap(): ReadonlyMap<string, TaskStatus> {
  return taskStatusMap
}

/** 获取所有任务进度快照 */
export function getProgressMap(): ReadonlyMap<string, { percent: number; message: string }> {
  return taskProgressMap
}

/**
 * 更新 taskStatusMap 中的状态（供组件在调用 taskApi.getLogs() 后联动更新）
 * 场景：展开任务时从 DB 拉取了历史日志，顺便同步一下最新状态
 */
export function setTaskStatus(taskId: string, status: TaskStatus): void {
  taskStatusMap.set(taskId, status)
}

// ─── React Hook ────────────────────────────────────────────────

import { useState, useEffect } from 'react'

export interface TaskStateSnapshot {
  /** 版本号 — 每次状态变更时递增，可用于 useEffect 依赖 */
  version: number
  /** 任务 ID → 最新状态 */
  statusMap: ReadonlyMap<string, TaskStatus>
  /** 任务 ID → 进度 */
  progressMap: ReadonlyMap<string, { percent: number; message: string }>
  /** 已完成任务的输出 */
  outputMap: ReadonlyMap<string, TaskOutput>
  /** 实时日志缓冲区（按 taskId 索引） */
  logBuffers: ReadonlyMap<string, StoredLog[]>
}

/**
 * React Hook — 订阅任务状态更新
 *
 * @returns 当前所有任务状态的只读快照
 *
 * 组件卸载后重新挂载时，返回的 Maps 中仍包含离开期间累积的数据，
 * 因为 IPC 监听器是模块级注册的，不受组件生命周期影响。
 */
export function useTaskState(): TaskStateSnapshot {
  const [, setTick] = useState(0)

  useEffect(() => {
    const handler: Subscriber = () => {
      setTick((t) => t + 1)
    }
    subscribers.add(handler)
    // 首次订阅时立即触发一次，让组件拿到初始快照
    handler()
    return () => {
      subscribers.delete(handler)
    }
  }, [])

  return {
    version,
    statusMap: taskStatusMap,
    progressMap: taskProgressMap,
    outputMap: taskOutputMap,
    logBuffers: taskLogBuffers
  }
}

/**
 * React Hook — 获取单个任务的最新状态
 *
 * @param taskId - 任务 ID
 * @returns 任务状态（来自内存，非 DB 查询）
 */
export function useTaskStatus(taskId: string | null): TaskStatus | undefined {
  const { statusMap } = useTaskState()
  return taskId ? statusMap.get(taskId) : undefined
}

/**
 * React Hook — 获取单个任务的实时日志缓冲区
 *
 * @param taskId - 任务 ID
 * @returns 实时日志数组（上限 500 条）
 */
export function useTaskLogBuffer(taskId: string | null): StoredLog[] {
  const { logBuffers } = useTaskState()
  return taskId ? (logBuffers.get(taskId) ?? []) : []
}

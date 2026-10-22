/**
 * @file 任务删除级联测试
 * @description 验证 TaskRepository.deleteTask 会在同一事务内删除关联 task_logs，
 *              避免删除任务后遗留永远无法查询的孤儿日志。
 * @module tests/main/services
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { rmSync } from 'fs'
import { StoreService } from '../../../src/main/services/store'

let store: StoreService
let dbPath: string

beforeEach(() => {
  dbPath = join(tmpdir(), `task-delete-cascade-${randomUUID()}.db`)
  store = new StoreService(dbPath)
})

afterEach(() => {
  store.close()
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(dbPath + suffix, { force: true })
  }
})

describe('TaskRepository.deleteTask cascade', () => {
  it('removes task logs when the task is deleted', () => {
    const task = store.taskRepo.createTask({
      scriptFolder: '/scripts/demo',
      config: {},
      status: 'idle',
      workerId: null,
      startedAt: null,
      endedAt: null,
      isSandbox: false
    })
    store.taskRepo.addTaskLog(task.id, 'info', 'line-1')
    store.taskRepo.addTaskLog(task.id, 'error', 'line-2')
    expect(store.taskRepo.getTaskLogs(task.id)).toHaveLength(2)

    expect(store.taskRepo.deleteTask(task.id)).toBe(true)

    expect(store.taskRepo.getTask(task.id)).toBeNull()
    expect(store.taskRepo.getTaskLogs(task.id)).toHaveLength(0)
  })

  it('keeps logs of other tasks intact', () => {
    const doomed = store.taskRepo.createTask({
      scriptFolder: '/scripts/a',
      config: {},
      status: 'idle',
      workerId: null,
      startedAt: null,
      endedAt: null,
      isSandbox: false
    })
    const kept = store.taskRepo.createTask({
      scriptFolder: '/scripts/b',
      config: {},
      status: 'idle',
      workerId: null,
      startedAt: null,
      endedAt: null,
      isSandbox: false
    })
    store.taskRepo.addTaskLog(doomed.id, 'info', 'doomed log')
    store.taskRepo.addTaskLog(kept.id, 'info', 'kept log')

    store.taskRepo.deleteTask(doomed.id)

    expect(store.taskRepo.getTaskLogs(doomed.id)).toHaveLength(0)
    expect(store.taskRepo.getTaskLogs(kept.id)).toHaveLength(1)
  })
})

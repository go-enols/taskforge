/**
 * @file 任务 IPC 处理器
 */
import { Task } from '../../../shared/types'
import { register, Services } from '../registry'

export function registerTaskHandlers(services: Services): void {
  const { taskRepo, taskService } = services

  register('task:list', (_page?, _pageSize?, _search?) =>
    taskRepo.listTasks(
      _page as number | undefined,
      _pageSize as number | undefined,
      _search as string | undefined
    )
  )
  register('task:get', (id) => taskRepo.getTask(id as string))
  register('task:create', (data) => {
    const input = data as Partial<Omit<Task, 'id'>>
    return taskRepo.createTask({
      scriptFolder: input.scriptFolder ?? '',
      config: input.config ?? {},
      status: input.status ?? 'idle',
      workerId: input.workerId ?? null,
      startedAt: input.startedAt ?? null,
      endedAt: input.endedAt ?? null,
      isSandbox: input.isSandbox ?? false
    })
  })
  register('task:update', (id, data) =>
    taskRepo.updateTask(id as string, data as Parameters<typeof taskRepo.updateTask>[1])
  )
  register('task:start', (id) => taskService.startTask(id as string))
  register('task:stop', (id) => taskService.stopTask(id as string))
  register('task:pause', (id) => taskService.pauseTask(id as string))
  register('task:resume', (id) => taskService.resumeTask(id as string))
  register('task:delete', (id) => taskRepo.deleteTask(id as string))
  register('task:getLogs', (taskId, limit?) =>
    taskRepo.getTaskLogs(taskId as string, limit as number | undefined)
  )
  register('task:clearLogs', (taskId?) => taskRepo.clearTaskLogs(taskId as string | undefined))
  register('task:getProgress', (taskId) => taskService.getTaskProgress(taskId as string))
  register('task:getOutput', (taskId) => taskService.getTaskOutput(taskId as string))
}

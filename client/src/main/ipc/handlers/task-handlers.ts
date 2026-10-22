/**
 * @file 任务 IPC 处理器
 */
import { Task } from '../../../shared/types'
import { register, Services } from '../registry'
import { isPathAuthorized } from '../../services/path-allowlist'

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
    const scriptFolder = input.scriptFolder ?? ''
    // 安全：任务脚本目录只能指向已安装脚本目录或用户本次会话选择过的目录，
    // 防止渲染层（或注入的页面代码）借 task:create 执行任意路径下的脚本。
    if (!scriptFolder || !isPathAuthorized(scriptFolder)) {
      throw Object.assign(new Error('Script folder is not authorized'), {
        code: 'FORBIDDEN',
        category: 'SECURITY'
      })
    }
    return taskRepo.createTask({
      scriptFolder,
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

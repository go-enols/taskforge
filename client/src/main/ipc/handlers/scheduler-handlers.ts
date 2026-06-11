/**
 * @file 定时任务 IPC 处理器
 */
import { register, Services } from '../registry'

export function registerSchedulerHandlers(services: Services): void {
  const { store } = services

  register('scheduler:list', (_page?, _pageSize?, _search?) =>
    store.listScheduledTasks(
      _page as number | undefined,
      _pageSize as number | undefined,
      _search as string | undefined
    )
  )
  register('scheduler:get', (id) => store.getScheduledTask(id as string))
  register('scheduler:create', (data) =>
    store.createScheduledTask(data as Parameters<typeof store.createScheduledTask>[0])
  )
  register('scheduler:update', (id, data) =>
    store.updateScheduledTask(id as string, data as Parameters<typeof store.updateScheduledTask>[1])
  )
  register('scheduler:delete', (id) => store.deleteScheduledTask(id as string))
}

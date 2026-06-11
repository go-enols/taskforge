/**
 * @file 任务模板 IPC 处理器
 */
import { register, Services } from '../registry'

export function registerTaskTemplateHandlers(services: Services): void {
  const { store } = services

  register('taskTemplate:list', (_page?, _pageSize?, _search?) =>
    store.listTaskTemplates(
      _page as number | undefined,
      _pageSize as number | undefined,
      _search as string | undefined
    )
  )
  register('taskTemplate:get', (id) => store.getTaskTemplate(id as string))
  register('taskTemplate:create', (data) =>
    store.createTaskTemplate(data as Parameters<typeof store.createTaskTemplate>[0])
  )
  register('taskTemplate:update', (id, data) =>
    store.updateTaskTemplate(id as string, data as Parameters<typeof store.updateTaskTemplate>[1])
  )
  register('taskTemplate:delete', (id) => store.deleteTaskTemplate(id as string))
}

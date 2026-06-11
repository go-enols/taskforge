/**
 * @file 项目模板 IPC 处理器
 */
import { register, Services } from '../registry'

export function registerProjectTemplateHandlers(services: Services): void {
  const { store } = services

  register('projectTemplate:list', () => store.listProjectTemplates())
  register('projectTemplate:get', (id) => store.getProjectTemplate(id as string))
  register('projectTemplate:create', (data) =>
    store.createProjectTemplate(data as Parameters<typeof store.createProjectTemplate>[0])
  )
  register('projectTemplate:update', (id, data) =>
    store.updateProjectTemplate(id as string, data as Parameters<typeof store.updateProjectTemplate>[1])
  )
  register('projectTemplate:delete', (id) => store.deleteProjectTemplate(id as string))
}

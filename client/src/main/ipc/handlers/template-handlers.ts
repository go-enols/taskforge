/**
 * @file 模板 IPC 处理器
 */
import { register, Services } from '../registry'

export function registerTemplateHandlers(services: Services): void {
  const { store } = services

  register('template:list', (_page?, _pageSize?, _search?) =>
    store.listTemplates(
      _page as number | undefined,
      _pageSize as number | undefined,
      _search as string | undefined
    )
  )
  register('template:get', (id) => store.getTemplate(id as string))
  register('template:create', (data) =>
    store.createTemplate(data as Parameters<typeof store.createTemplate>[0])
  )
  register('template:update', (id, data) =>
    store.updateTemplate(id as string, data as Parameters<typeof store.updateTemplate>[1])
  )
  register('template:delete', (id) => store.deleteTemplate(id as string))
  register('template:checkScriptParams', (id) => store.countScriptParamsByTemplate(id as string))
}

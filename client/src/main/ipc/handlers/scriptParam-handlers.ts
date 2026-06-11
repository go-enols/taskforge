/**
 * @file 脚本参数 IPC 处理器
 */
import { register, Services } from '../registry'

export function registerScriptParamHandlers(services: Services): void {
  const { store } = services

  register('scriptParam:list', (_page?, _pageSize?, _search?) =>
    store.listScriptParams(
      _page as number | undefined,
      _pageSize as number | undefined,
      _search as string | undefined
    )
  )
  register('scriptParam:get', (id) => store.getScriptParam(id as string))
  register('scriptParam:create', (data) =>
    store.createScriptParam(data as Parameters<typeof store.createScriptParam>[0])
  )
  register('scriptParam:update', (id, data) =>
    store.updateScriptParam(id as string, data as Parameters<typeof store.updateScriptParam>[1])
  )
  register('scriptParam:delete', (id) => store.deleteScriptParam(id as string))
  register('scriptParam:listPools', () => store.listScriptParamPools())
  register('scriptParam:batchCreate', (items) =>
    store.batchCreateScriptParams(items as Parameters<typeof store.batchCreateScriptParams>[0])
  )
}

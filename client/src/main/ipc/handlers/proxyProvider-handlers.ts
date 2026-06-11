/**
 * @file 代理提供商 IPC 处理器
 */
import { register, Services } from '../registry'

export function registerProxyProviderHandlers(services: Services): void {
  const { store } = services

  register('proxyProvider:list', (_page?, _pageSize?, _search?) =>
    store.listProxyProviders(
      _page as number | undefined,
      _pageSize as number | undefined,
      _search as string | undefined
    )
  )
  register('proxyProvider:get', (id) => store.getProxyProvider(id as string))
  register('proxyProvider:create', (data) =>
    store.createProxyProvider(data as Parameters<typeof store.createProxyProvider>[0])
  )
  register('proxyProvider:update', (id, data) =>
    store.updateProxyProvider(id as string, data as Parameters<typeof store.updateProxyProvider>[1])
  )
  register('proxyProvider:delete', (id) => store.deleteProxyProvider(id as string))
}

/**
 * @file 代理 IPC 处理器
 */
import { register, Services } from '../registry'

export function registerProxyHandlers(services: Services): void {
  const { proxyRepo } = services

  register('proxy:list', (_page?, _pageSize?, _search?) =>
    proxyRepo.listProxies(
      _page as number | undefined,
      _pageSize as number | undefined,
      _search as string | undefined
    )
  )
  register('proxy:get', (id) => proxyRepo.getProxy(id as string))
  register('proxy:create', (data) =>
    proxyRepo.createProxy(data as Parameters<typeof proxyRepo.createProxy>[0])
  )
  register('proxy:update', (id, data) =>
    proxyRepo.updateProxy(id as string, data as Parameters<typeof proxyRepo.updateProxy>[1])
  )
  register('proxy:delete', (id) => proxyRepo.deleteProxy(id as string))
  register('proxy:batchDelete', (ids) => proxyRepo.batchDeleteProxies(ids as string[]))
}

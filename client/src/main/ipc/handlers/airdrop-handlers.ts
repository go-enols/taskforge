/**
 * @file 空投项目 IPC 处理器
 */
import { register, Services } from '../registry'

export function registerAirdropHandlers(services: Services): void {
  const { store } = services

  register('airdrop:list', (_page?, _pageSize?, _search?) =>
    store.listAirdrops(
      _page as number | undefined,
      _pageSize as number | undefined,
      _search as string | undefined
    )
  )
  register('airdrop:create', (data) =>
    store.createAirdrop(data as Parameters<typeof store.createAirdrop>[0])
  )
  register('airdrop:get', (id) => store.getAirdrop(id as string))
  register('airdrop:update', (id, data) =>
    store.updateAirdrop(id as string, data as Parameters<typeof store.updateAirdrop>[1])
  )
  register('airdrop:delete', (id) => store.deleteAirdrop(id as string))
  register('airdrop:analytics', () => store.getAirdropAnalytics())
}

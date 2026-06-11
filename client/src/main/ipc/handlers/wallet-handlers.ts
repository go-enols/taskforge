/**
 * @file 钱包 IPC 处理器
 */
import { register, Services } from '../registry'

export function registerWalletHandlers(services: Services): void {
  const { walletRepo } = services

  register('wallet:list', (_page?, _pageSize?, _search?) =>
    walletRepo.listWallets(
      _page as number | undefined,
      _pageSize as number | undefined,
      _search as string | undefined
    )
  )
  register('wallet:get', (id) => walletRepo.getWallet(id as string))
  register('wallet:create', (data) =>
    walletRepo.createWallet(data as Parameters<typeof walletRepo.createWallet>[0])
  )
  register('wallet:update', (id, data) =>
    walletRepo.updateWallet(id as string, data as Parameters<typeof walletRepo.updateWallet>[1])
  )
  register('wallet:delete', (id) => walletRepo.deleteWallet(id as string))
  register('wallet:batchDelete', (ids) => walletRepo.batchDeleteWallets(ids as string[]))
}

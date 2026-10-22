/**
 * @file 钱包 IPC 处理器
 */
import { register, Services } from '../registry'
import type { Wallet } from '../../../shared/types'

/**
 * 列表脱敏：私钥/助记词不进入渲染进程。
 *
 * 渲染层的所有页面（任务数据选择、Dashboard 统计等）都只需要地址/标签等展示字段；
 * 密钥只在「导出/签名」这类明确动作时通过独立通道按需返回。
 */
function toWalletSummary(wallet: Wallet): Wallet {
  return { ...wallet, privateKey: null, mnemonic: null }
}

export function registerWalletHandlers(services: Services): void {
  const { walletRepo } = services

  register('wallet:list', (_page?, _pageSize?, _search?) => {
    const result = walletRepo.listWallets(
      _page as number | undefined,
      _pageSize as number | undefined,
      _search as string | undefined
    )
    return { ...result, items: result.items.map(toWalletSummary) }
  })
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

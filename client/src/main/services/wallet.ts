/**
 * @file WalletService — 钱包管理服务
 * @description 提供多链钱包的生成、助记词派生和持久化功能。
 *              支持 EVM（ethers.js）、Solana（@solana/web3.js）、SUI（@mysten/sui.js）三种链。
 * @module main/services
 */

import { ethers } from 'ethers'
import * as bip39 from 'bip39'
import { Keypair } from '@solana/web3.js'
import { derivePath } from 'ed25519-hd-key'
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519'
import type { StoreService } from './store'

/**
 * 钱包管理服务
 *
 * 封装多链钱包的生成逻辑，支持三种钱包类型：
 * - EVM：使用 ethers.HDNodeWallet，BIP44 路径 m/44'/60'/{index}'/0/0
 * - Solana：使用 ed25519-hd-key 派生 + @solana/web3.js Keypair，BIP44 路径 m/44'/501'/{index}'/0'
 * - SUI：使用 ed25519-hd-key 派生 + @mysten/sui.js Ed25519Keypair，BIP44 路径 m/44'/784'/{index}'/0'
 *
 * 生成的 wallet 会自动存储到数据库（通过 StoreService.walletRepo）。
 *
 * @example
 * ```ts
 * const walletService = new WalletService(store)
 * const mnemonic = await walletService.generateMnemonic()
 * const wallets = await walletService.deriveAndSaveFromMnemonic(mnemonic, 5, ['evm', 'solana'])
 * ```
 */
export class WalletService {
  private store: StoreService

  constructor(store: StoreService) {
    this.store = store
  }

  /** 生成 BIP39 助记词（12 词英文） */
  async generateMnemonic(): Promise<string> {
    return bip39.generateMnemonic()
  }

  /**
   * 生成单链随机钱包
   *
   * 根据 walletType 创建对应链的随机密钥对，不依赖助记词。
   *
   * @param walletType - 钱包类型：evm / solana / sui
   * @returns 包含地址、私钥和钱包类型的对象
   * @throws 不支持的钱包类型时抛出 Error
   */
  async generateKeypair(
    walletType: string
  ): Promise<{ address: string; privateKey: string; walletType: string }> {
    switch (walletType) {
      case 'evm': {
        const wallet = ethers.Wallet.createRandom()
        return { address: wallet.address, privateKey: wallet.privateKey, walletType }
      }
      case 'solana': {
        const keypair = Keypair.generate()
        return {
          address: keypair.publicKey.toBase58(),
          privateKey: Buffer.from(keypair.secretKey).toString('hex'),
          walletType
        }
      }
      case 'sui': {
        const keypair = new Ed25519Keypair()
        return {
          address: keypair.getPublicKey().toSuiAddress(),
          privateKey: Buffer.from(keypair.getSecretKey()).toString('hex'),
          walletType
        }
      }
      default:
        throw new Error(`Unsupported wallet type: ${walletType}`)
    }
  }

  /**
   * 从助记词派生多链钱包
   *
   * 根据 BIP44 标准路径派生指定数量的钱包。每个索引会为每种 walletType 生成一个钱包：
   * - EVM：m/44'/60'/{index}'/0/0
   * - Solana：m/44'/501'/{index}'/0'
   * - SUI：m/44'/784'/{index}'/0'
   *
   * @param mnemonic - BIP39 助记词短语
   * @param count - 每个链要派生的钱包数量（索引从 0 开始）
   * @param walletTypes - 要派生的钱包类型数组，如 ['evm', 'solana']
   * @returns 派生结果数组，包含索引、链类型、地址和私钥
   * @throws 助记词无效时抛出 Error
   */
  async deriveFromMnemonic(
    mnemonic: string,
    count: number,
    walletTypes: string[]
  ): Promise<Array<{ index: number; walletType: string; address: string; privateKey: string }>> {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic')
    }
    const results: Array<{
      index: number
      walletType: string
      address: string
      privateKey: string
    }> = []
    for (let i = 0; i < count; i++) {
      for (const walletType of walletTypes) {
        switch (walletType) {
          case 'evm': {
            const path = `m/44'/60'/${i}'/0/0`
            const hdNode = ethers.HDNodeWallet.fromMnemonic(
              ethers.Mnemonic.fromPhrase(mnemonic),
              path
            )
            results.push({
              index: i,
              walletType,
              address: hdNode.address,
              privateKey: hdNode.privateKey
            })
            break
          }
          case 'solana': {
            const path = `m/44'/501'/${i}'/0'`
            const seed = await bip39.mnemonicToSeed(mnemonic)
            const derivedSeed = derivePath(path, seed.toString('hex')).key
            const keypair = Keypair.fromSeed(derivedSeed)
            results.push({
              index: i,
              walletType,
              address: keypair.publicKey.toBase58(),
              privateKey: Buffer.from(keypair.secretKey).toString('hex')
            })
            break
          }
          case 'sui': {
            const path = `m/44'/784'/${i}'/0'`
            const seed = await bip39.mnemonicToSeed(mnemonic)
            const derivedSeed = derivePath(path, seed.toString('hex')).key
            const keypair = Ed25519Keypair.fromSecretKey(derivedSeed)
            results.push({
              index: i,
              walletType,
              address: keypair.getPublicKey().toSuiAddress(),
              privateKey: Buffer.from(keypair.getSecretKey()).toString('hex')
            })
            break
          }
        }
      }
    }
    return results
  }

  /**
   * 生成随机钱包并保存到数据库
   *
   * 调用 generateKeypair 生成密钥对，随后通过 StoreService.walletRepo
   * 将钱包持久化到 SQLite 数据库。
   *
   * @param walletType - 钱包类型：evm / solana / sui
   * @returns 已保存的 Wallet 对象
   */
  async generateAndSaveKeypair(walletType: string): Promise<import('../../shared/types').Wallet> {
    const keypair = await this.generateKeypair(walletType)
    return this.store.walletRepo.createWallet({
      address: keypair.address,
      privateKey: keypair.privateKey,
      mnemonic: null,
      walletType: keypair.walletType as import('../../shared/types').Wallet['walletType'],
      labels: []
    })
  }

  /**
   * 从助记词派生钱包并批量保存到数据库
   *
   * 调用 deriveFromMnemonic 批量派生后，遍历结果逐条通过
   * StoreService.walletRepo.createWallet 持久化。
   *
   * @param mnemonic - BIP39 助记词短语
   * @param count - 每个链要派生的钱包数量
   * @param walletTypes - 要派生的钱包类型数组
   * @returns 已保存的 Wallet 对象数组
   */
  async deriveAndSaveFromMnemonic(
    mnemonic: string,
    count: number,
    walletTypes: string[]
  ): Promise<import('../../shared/types').Wallet[]> {
    const derived = await this.deriveFromMnemonic(mnemonic, count, walletTypes)
    const wallets: import('../../shared/types').Wallet[] = []
    for (const item of derived) {
      const wallet = this.store.walletRepo.createWallet({
        address: item.address,
        privateKey: item.privateKey,
        mnemonic,
        walletType: item.walletType as import('../../shared/types').Wallet['walletType'],
        labels: []
      })
      wallets.push(wallet)
    }
    return wallets
  }
}

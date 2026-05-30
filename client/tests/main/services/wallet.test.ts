import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { WalletService } from '../../../src/main/services/wallet'
import { StoreService } from '../../../src/main/services/store'

describe('WalletService', () => {
  let store: StoreService
  let walletService: WalletService

  beforeEach(() => {
    const dbPath = join(tmpdir(), `wallet-test-${randomUUID()}.db`)
    store = new StoreService(dbPath)
    walletService = new WalletService(store)
  })

  afterEach(() => {
    store.close()
  })

  describe('generateMnemonic', () => {
    it('returns 12-word mnemonic', async () => {
      const mnemonic = await walletService.generateMnemonic()
      const words = mnemonic.split(' ')
      expect(words).toHaveLength(12)
    })

    it('generates different mnemonics each time', async () => {
      const first = await walletService.generateMnemonic()
      const second = await walletService.generateMnemonic()
      expect(first).not.toBe(second)
    })
  })

  describe('generateKeypair', () => {
    it('evm type returns 0x-prefixed address and privateKey with walletType evm', async () => {
      const result = await walletService.generateKeypair('evm')
      expect(result.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(result.privateKey).toMatch(/^0x[0-9a-fA-F]{64}$/)
      expect(result.walletType).toBe('evm')
    })

    it('solana type returns base58 address and hex privateKey with walletType solana', async () => {
      const result = await walletService.generateKeypair('solana')
      expect(result.address).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/)
      expect(result.privateKey).toMatch(/^[0-9a-fA-F]+$/)
      expect(result.walletType).toBe('solana')
    })

    it('sui type returns 0x-prefixed address and hex privateKey with walletType sui', async () => {
      const result = await walletService.generateKeypair('sui')
      expect(result.address).toMatch(/^0x[0-9a-fA-F]+$/)
      expect(result.privateKey).toMatch(/^[0-9a-fA-F]+$/)
      expect(result.walletType).toBe('sui')
    })

    it('unsupported type throws Error', async () => {
      await expect(walletService.generateKeypair('bitcoin')).rejects.toThrow(
        'Unsupported wallet type: bitcoin'
      )
    })
  })

  describe('deriveFromMnemonic', () => {
    const mnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

    it('derives EVM wallets from valid mnemonic', async () => {
      const results = await walletService.deriveFromMnemonic(mnemonic, 3, ['evm'])
      expect(results).toHaveLength(3)
      for (const r of results) {
        expect(r.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
        expect(r.privateKey).toMatch(/^0x[0-9a-fA-F]{64}$/)
        expect(r.walletType).toBe('evm')
        expect(r).toHaveProperty('index')
      }
    })

    it('derives Solana wallets from valid mnemonic', async () => {
      const results = await walletService.deriveFromMnemonic(mnemonic, 2, ['solana'])
      expect(results).toHaveLength(2)
      for (const r of results) {
        expect(r.address).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/)
        expect(r.privateKey).toMatch(/^[0-9a-fA-F]+$/)
        expect(r.walletType).toBe('solana')
      }
    })

    it('derives Sui wallets from valid mnemonic', async () => {
      const results = await walletService.deriveFromMnemonic(mnemonic, 2, ['sui'])
      expect(results).toHaveLength(2)
      for (const r of results) {
        expect(r.address).toMatch(/^0x[0-9a-fA-F]+$/)
        expect(r.privateKey).toMatch(/^[0-9a-fA-F]+$/)
        expect(r.walletType).toBe('sui')
      }
    })

    it('derives multiple wallet types simultaneously', async () => {
      const results = await walletService.deriveFromMnemonic(mnemonic, 2, ['evm', 'solana', 'sui'])
      expect(results).toHaveLength(6)
      const evmResults = results.filter((r) => r.walletType === 'evm')
      const solanaResults = results.filter((r) => r.walletType === 'solana')
      const suiResults = results.filter((r) => r.walletType === 'sui')
      expect(evmResults).toHaveLength(2)
      expect(solanaResults).toHaveLength(2)
      expect(suiResults).toHaveLength(2)
    })

    it('throws Error for invalid mnemonic', async () => {
      await expect(
        walletService.deriveFromMnemonic('invalid mnemonic phrase', 1, ['evm'])
      ).rejects.toThrow('Invalid mnemonic')
    })

    it('derives with index starting from 0 and incrementing', async () => {
      const results = await walletService.deriveFromMnemonic(mnemonic, 3, ['evm'])
      expect(results[0].index).toBe(0)
      expect(results[1].index).toBe(1)
      expect(results[2].index).toBe(2)
    })
  })

  describe('generateAndSaveKeypair', () => {
    it('generates and saves EVM wallet to database', async () => {
      const wallet = await walletService.generateAndSaveKeypair('evm')
      expect(wallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(wallet.privateKey).toMatch(/^0x[0-9a-fA-F]{64}$/)
      expect(wallet.walletType).toBe('evm')
      expect(wallet.mnemonic).toBeNull()
      expect(wallet.labels).toEqual([])
    })

    it('returns Wallet object with id and createdAt', async () => {
      const wallet = await walletService.generateAndSaveKeypair('evm')
      expect(wallet.id).toBeDefined()
      expect(typeof wallet.id).toBe('string')
      expect(wallet.id.length).toBeGreaterThan(0)
      expect(wallet.createdAt).toBeDefined()
      expect(typeof wallet.createdAt).toBe('string')
      expect(new Date(wallet.createdAt).getTime()).not.toBeNaN()
    })
  })

  describe('deriveAndSaveFromMnemonic', () => {
    const mnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

    it('derives and saves multiple wallets to database', async () => {
      const wallets = await walletService.deriveAndSaveFromMnemonic(mnemonic, 2, ['evm', 'solana'])
      expect(wallets).toHaveLength(4)
      for (const wallet of wallets) {
        expect(wallet.id).toBeDefined()
        expect(wallet.createdAt).toBeDefined()
        expect(wallet.mnemonic).toBe(mnemonic)
        expect(wallet.labels).toEqual([])
      }
    })

    it('returns Wallet array with correct length', async () => {
      const wallets = await walletService.deriveAndSaveFromMnemonic(mnemonic, 3, ['evm'])
      expect(wallets).toHaveLength(3)
    })
  })
})

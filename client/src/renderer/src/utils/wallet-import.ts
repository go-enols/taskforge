import type { Wallet } from '../types'

export type ParsedWallet = Omit<Wallet, 'id' | 'createdAt'>

const VALID_WALLET_TYPES: ReadonlyArray<Wallet['walletType']> = ['evm', 'solana', 'sui', 'bitcoin']

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateOne(item: unknown, index: number): ParsedWallet {
  if (!isPlainObject(item)) {
    throw new Error(`Item #${index + 1} must be an object`)
  }

  const { address, privateKey, mnemonic, walletType, labels } = item

  if (typeof address !== 'string' || address.trim() === '') {
    throw new Error(`Item #${index + 1}: missing or invalid "address"`)
  }
  if (typeof privateKey !== 'string' || privateKey.trim() === '') {
    throw new Error(`Item #${index + 1}: missing or invalid "privateKey"`)
  }
  if (typeof walletType !== 'string') {
    throw new Error(`Item #${index + 1}: missing or invalid "walletType"`)
  }
  if (!VALID_WALLET_TYPES.includes(walletType as Wallet['walletType'])) {
    throw new Error(
      `Item #${index + 1}: "walletType" must be one of ${VALID_WALLET_TYPES.join(', ')}`
    )
  }

  let parsedLabels: string[] = []
  if (labels !== undefined && labels !== null) {
    if (!Array.isArray(labels) || !labels.every((l) => typeof l === 'string')) {
      throw new Error(`Item #${index + 1}: "labels" must be an array of strings`)
    }
    parsedLabels = labels as string[]
  }

  let parsedMnemonic: string | null = null
  if (mnemonic !== undefined && mnemonic !== null) {
    if (typeof mnemonic !== 'string') {
      throw new Error(`Item #${index + 1}: "mnemonic" must be a string`)
    }
    parsedMnemonic = mnemonic
  }

  return {
    address: address.trim(),
    privateKey: privateKey.trim(),
    mnemonic: parsedMnemonic,
    walletType: walletType as Wallet['walletType'],
    labels: parsedLabels
  }
}

export function parseWalletJson(raw: string): ParsedWallet[] {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error('Empty JSON content')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (err) {
    throw new Error(`Invalid JSON: ${(err as Error).message}`)
  }

  const list = Array.isArray(parsed) ? parsed : [parsed]
  if (list.length === 0) {
    throw new Error('No wallets found in JSON')
  }

  return list.map((item, i) => validateOne(item, i))
}

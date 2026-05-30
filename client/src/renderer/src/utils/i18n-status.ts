import type { TFunction } from 'i18next'

export type StatusDomain = 'task' | 'airdrop' | 'proxy' | 'wallet' | 'log' | 'airdropType'

const STATUS_KEY_MAP: Record<StatusDomain, Record<string, string>> = {
  task: {
    idle: 'tasks.status.idle',
    running: 'tasks.status.running',
    paused: 'tasks.status.paused',
    stopped: 'tasks.status.stopped',
    complete: 'tasks.status.complete',
    error: 'tasks.status.error'
  },
  airdrop: {
    ongoing: 'airdrops.statusOngoing',
    completed: 'airdrops.statusCompleted',
    cancelled: 'airdrops.statusCancelled',
    claimed: 'airdrops.statusClaimed'
  },
  airdropType: {
    testnet: 'airdrops.typeTestnet',
    mainnet: 'airdrops.typeMainnet',
    galxe: 'airdrops.typeGalxe',
    quest: 'airdrops.typeQuest',
    social: 'airdrops.typeSocial',
    other: 'airdrops.typeOther'
  },
  proxy: {
    active: 'proxies.statusActive',
    inactive: 'proxies.statusInactive',
    expired: 'proxies.statusExpired'
  },
  wallet: {
    evm: 'EVM',
    solana: 'Solana',
    sui: 'Sui',
    bitcoin: 'Bitcoin'
  },
  log: {
    debug: 'logs.levelDebug',
    info: 'logs.levelInfo',
    warn: 'logs.levelWarn',
    error: 'logs.levelError'
  }
}

/**
 * Map a domain status value to its localized label.
 * Falls back to the original value when the mapping is missing.
 */
export function statusLabel(domain: StatusDomain, value: string, t: TFunction): string {
  const key = STATUS_KEY_MAP[domain]?.[value]
  if (!key) return value
  if (domain === 'wallet') return key
  return t(key, value)
}

/**
 * @file airdrop-mappers — 项目数据映射与格式化工具
 * @description 提供项目状态/类型的颜色映射、i18n key 映射、边框类名生成、
 *              收益摘要聚合和 USD 金额格式化等纯函数工具。
 * @module renderer/components/airdrops
 */
import type {
  AirdropStatus,
  AirdropProjectType,
  AirdropLink,
  AirdropTaskItem,
  Earning
} from '../../../../shared/types'

/**
 * 状态徽章颜色映射
 *
 * 用于卡片列表和详情页的状态列，使用项目的 Tailwind 主题 token（参见 assets/main.css）。
 */
export const statusColorMap: Record<AirdropStatus, string> = {
  ongoing: 'bg-primary-light text-primary',
  completed: 'bg-success-light text-success',
  cancelled: 'bg-danger-light text-danger',
  claimed: 'bg-purple-light text-purple'
}

/** 项目类型徽章颜色映射 */
export const typeColorMap: Record<AirdropProjectType, string> = {
  testnet: 'bg-cyan-light text-cyan',
  mainnet: 'bg-primary-light text-primary',
  galxe: 'bg-orange-light text-orange',
  quest: 'bg-purple-light text-purple',
  social: 'bg-pink-light text-pink',
  other: 'bg-bg-tertiary text-text-secondary'
}

/**
 * 状态标签的 i18n key 映射
 *
 * 使国际化目录作为唯一真实来源，避免硬编码显示文本。
 */
export const statusLabelKey: Record<AirdropStatus, string> = {
  ongoing: 'airdrops.statusOngoing',
  completed: 'airdrops.statusCompleted',
  cancelled: 'airdrops.statusCancelled',
  claimed: 'airdrops.statusClaimed'
}

/** 项目类型标签的 i18n key 映射 */
export const typeLabelKey: Record<AirdropProjectType, string> = {
  testnet: 'airdrops.typeTestnet',
  mainnet: 'airdrops.typeMainnet',
  galxe: 'airdrops.typeGalxe',
  quest: 'airdrops.typeQuest',
  social: 'airdrops.typeSocial',
  other: 'airdrops.typeOther'
}

/**
 * 根据状态返回卡片左侧边框颜色类
 *
 * 为卡片添加 2-3px 左边框，以颜色快速指示项目状态。
 *
 * @param status - 项目状态
 * @returns Tailwind 边框颜色类
 */
export const statusBorderClass = (status: AirdropStatus): string => {
  switch (status) {
    case 'ongoing':
      return 'border-l-primary'
    case 'completed':
      return 'border-l-success'
    case 'cancelled':
      return 'border-l-danger'
    case 'claimed':
      return 'border-l-purple-500'
    default:
      return 'border-l-border-light'
  }
}

/**
 * 根据状态返回 KPI 磁贴的背景强调色
 *
 * 用于 KPI 指标栏中各状态磁贴的视觉区分。
 *
 * @param status - 项目状态
 * @returns Tailwind 边框和背景类
 */
export const statusAccent = (status: AirdropStatus): string => {
  switch (status) {
    case 'ongoing':
      return 'border-l-primary bg-primary-50/50'
    case 'completed':
      return 'border-l-success bg-success-50/50'
    case 'cancelled':
      return 'border-l-danger bg-danger-50/50'
    case 'claimed':
      return 'border-l-purple-500 bg-purple-50/50'
    default:
      return 'border-l-border-light'
  }
}

/** 项目各项数量的统计结果 */
export interface AirdropCounts {
  /** 链接数量 */
  links: number
  /** 任务数量 */
  tasks: number
  /** 收益记录数量 */
  earnings: number
}

/** 统计项目的链接、任务和收益记录数量 */
export const summarizeCounts = (
  links: AirdropLink[],
  tasks: AirdropTaskItem[],
  earnings: Earning[]
): AirdropCounts => ({
  links: links.length,
  tasks: tasks.length,
  earnings: earnings.length
})

/** 按代币聚合的收益摘要行 */
export interface EarningsSummaryRow {
  /** 代币名称 */
  token: string
  /** 总数量 */
  amount: number
  /** 总 USD 估值 */
  valueUsd: number
}

/**
 * 按代币聚合收益记录
 *
 * 跳过名称为空的代币条目。缺失 valueUsd 时按 0 处理。
 * 返回结果按总 valueUsd 降序排列，相同 valueUsd 时按总数量降序排列。
 *
 * @param earnings - 收益记录数组
 * @returns 按代币聚合的摘要行数组
 */
export const formatEarningsSummary = (earnings: Earning[]): EarningsSummaryRow[] => {
  const map = new Map<string, { amount: number; valueUsd: number }>()
  for (const e of earnings) {
    const token = (e.token ?? '').trim()
    if (!token) continue
    const prev = map.get(token) ?? { amount: 0, valueUsd: 0 }
    map.set(token, {
      amount: prev.amount + (Number(e.amount) || 0),
      valueUsd: prev.valueUsd + (Number(e.valueUsd) || 0)
    })
  }
  return Array.from(map.entries())
    .map(([token, v]) => ({ token, amount: v.amount, valueUsd: v.valueUsd }))
    .sort((a, b) => {
      if (b.valueUsd !== a.valueUsd) return b.valueUsd - a.valueUsd
      return b.amount - a.amount
    })
}

/**
 * 格式化 USD 金额为可读字符串
 *
 * 非有限值返回 "$0"，正常值使用美国英语区域格式，
 * 最多保留 2 位小数。
 *
 * @param value - 数值
 * @returns 格式化后的字符串，如 "$1,234.56"
 */
export const formatUsd = (value: number): string => {
  if (!Number.isFinite(value)) return '$0'
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

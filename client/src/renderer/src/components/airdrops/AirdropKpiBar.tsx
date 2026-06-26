/**
 * @file AirdropKpiBar — 项目 KPI 指标栏组件
 * @description 展示项目相关的核心 KPI 指标：项目总数、进行中数、已完成数、总收益 USD。
 *              底部展示收益最高的前 2 种代币摘要。
 * @module renderer/components/airdrops
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { FolderKanban, PlayCircle, CheckCircle2, TrendingUp } from 'lucide-react'
import type { AirdropAnalytics, TokenEarnings } from '../../../../shared/types'
import { formatUsd } from './airdrop-mappers'

interface AirdropKpiBarProps {
  /** 空投分析统计数据 */
  analytics: AirdropAnalytics
}

/** 单个 KPI 磁贴的配置结构 */
interface KpiTile {
  /** i18n 标签 key */
  labelKey: string
  /** 显示数值 */
  value: string
  /** lucide-react 图标组件 */
  icon: React.ComponentType<{ size?: number; className?: string }>
  /** 左边框颜色类 */
  accent: string
  /** 图标颜色类 */
  iconColor: string
}

/**
 * AirdropKpiBar — 项目 KPI 指标栏组件
 *
 * 以四格网格展示项目分析指标（总数/进行中/已完成/收益 USD），
 * 底部额外显示收益最高的前 2 种代币的金额和价值。
 * 用于 Dashboard 页面的项目概览区域。
 *
 * @param analytics - 分析统计数据
 */
const AirdropKpiBar: React.FC<AirdropKpiBarProps> = ({ analytics }) => {
  const { t } = useTranslation()

  // 取收益最高的前 2 种代币显示在底部摘要行
  const topTokens = (analytics.tokenEarnings || []).slice(0, 2)

  // 定义 4 个 KPI 磁贴的配置
  const tiles: KpiTile[] = [
    {
      labelKey: 'airdrops.kpi.total',
      value: String(analytics.totalAirdrops),
      icon: FolderKanban,
      accent: 'border-l-primary',
      iconColor: 'text-primary'
    },
    {
      labelKey: 'airdrops.kpi.ongoing',
      value: String(analytics.ongoingCount),
      icon: PlayCircle,
      accent: 'border-l-primary',
      iconColor: 'text-primary'
    },
    {
      labelKey: 'airdrops.kpi.claimed',
      value: String(analytics.claimedCount),
      icon: CheckCircle2,
      accent: 'border-l-purple-500',
      iconColor: 'text-purple'
    },
    {
      labelKey: 'airdrops.kpi.earnings',
      value: formatUsd(analytics.totalEarningsValueUsd || 0),
      icon: TrendingUp,
      accent: 'border-l-success',
      iconColor: 'text-success'
    }
  ]

  return (
    <div className="space-y-2">
      {/* 4 个 KPI 指标磁贴网格 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tiles.map((tile) => {
          const Icon = tile.icon
          return (
            <div
              key={tile.labelKey}
              className={`bg-bg-card rounded-lg border border-border-light border-l-[3px] ${tile.accent} px-3 py-2.5 flex items-center gap-3 hover:border-border-hover transition-colors`}
            >
              <div className={`shrink-0 ${tile.iconColor}`}>
                <Icon size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-text-muted font-medium leading-tight">
                  {t(tile.labelKey)}
                </div>
                <div className="text-lg font-bold text-text-primary leading-tight truncate">
                  {tile.value}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {/* Top 代币收益摘要行 */}
      {topTokens.length > 0 && (
        <div className="flex items-center gap-1.5 px-1 text-[11px] text-text-muted">
          <span className="font-medium">{t('airdrops.kpi.topTokens')}:</span>
          {topTokens.map((t2: TokenEarnings) => (
            <span
              key={t2.token}
              className="inline-flex items-center px-1.5 py-0.5 bg-bg-card border border-border-light rounded text-text-secondary font-medium tabular-nums"
            >
              {t2.totalAmount} {t2.token}
              {t2.totalValueUsd != null && t2.totalValueUsd > 0 && (
                <span className="ml-1 text-text-muted text-[10px]">
                  ${t2.totalValueUsd.toLocaleString()}
                </span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default AirdropKpiBar

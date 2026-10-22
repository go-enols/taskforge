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
  /** 图标底座配色 */
  tone: string
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
      tone: 'bg-primary/10 text-primary'
    },
    {
      labelKey: 'airdrops.kpi.ongoing',
      value: String(analytics.ongoingCount),
      icon: PlayCircle,
      tone: 'bg-info/10 text-info'
    },
    {
      labelKey: 'airdrops.kpi.claimed',
      value: String(analytics.claimedCount),
      icon: CheckCircle2,
      tone: 'bg-success/10 text-success'
    },
    {
      labelKey: 'airdrops.kpi.earnings',
      value: formatUsd(analytics.totalEarningsValueUsd || 0),
      icon: TrendingUp,
      tone: 'bg-brand-2/10 text-brand-2'
    }
  ]

  return (
    <div className="space-y-2.5">
      {/* 4 个 KPI 指标磁贴网格 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((tile) => {
          const Icon = tile.icon
          return (
            <div key={tile.labelKey} className="surface-card surface-card-hover relative overflow-hidden p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${tile.tone}`}>
                  <Icon size={16} />
                </div>
              </div>
              <div className="mt-2.5">
                <div className="text-[11px] font-medium text-text-muted">{t(tile.labelKey)}</div>
                <div className="kpi-value mt-0.5 truncate text-xl font-semibold text-text-primary">
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
              className="inline-flex items-center rounded-md border border-border-light bg-bg-card px-1.5 py-0.5 font-medium tabular-nums text-text-secondary"
            >
              {t2.totalAmount} {t2.token}
              {t2.totalValueUsd != null && t2.totalValueUsd > 0 && (
                <span className="ml-1 text-[10px] text-text-muted">                  ${t2.totalValueUsd.toLocaleString()}
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

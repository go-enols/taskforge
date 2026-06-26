/**
 * @file Stats — 统计页面
 * @description 展示钱包、代理、任务、参数模板等维度的统计数据，包括数量汇总与分布图表。
 * @module renderer/pages
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { appApi } from '../api'
import type { StatsAggregate } from '../types'
import { RefreshCw, BarChart3 } from 'lucide-react'
import { statusLabel } from '../utils/i18n-status'

/**
 * Stats — 统计概览页面组件
 *
 * 从主进程获取聚合统计信息并以卡片形式展示钱包链分布、代理协议分布、
 * 任务状态分布、模板使用排行等。
 */
const Stats: React.FC = () => {
  const { t } = useTranslation()
  const [stats, setStats] = useState<StatsAggregate | null>(null)
  const [loading, setLoading] = useState(false)

  /** 从主进程拉取统计数据 */
  const fetchData = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const res = await appApi.getStats()
      setStats(res)
    } catch {
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData()
  }, [fetchData])

  /** 格式化成功率（null 时显示占位符） */
  const formatRate = (rate: number | null | undefined): string => {
    if (rate == null) return '—'
    return `${(rate * 100).toFixed(1)}%`
  }

  /** 将分布统计转为按值降序排列的键值对数组 */
  const distributionEntries = (
    dist: Record<string, number> | null | undefined
  ): Array<[string, number]> => {
    return Object.entries(dist || {}).sort((a, b) => b[1] - a[1])
  }

  return (
    <div className="space-y-6">
      {/* 页面标题与刷新按钮 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('stats.title')}</h1>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-text-secondary bg-bg-card border border-border-light rounded-lg hover:bg-bg-card-hover disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          {t('common.refresh')}
        </button>
      </div>

      {loading && !stats ? (
        <div className="flex items-center justify-center py-20 text-text-muted">
          <span>{t('common.loading')}</span>
        </div>
      ) : !stats ? (
        <div className="flex flex-col items-center justify-center py-20 text-text-muted">
          <BarChart3 size={48} />
          <p className="mt-4 text-lg">{t('common.noData')}</p>
        </div>
      ) : (
        <>
          {/* 四列统计卡片：钱包总数、代理总数、任务总数、成功率 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 钱包总数卡片（含链分布明细） */}
            <div className="bg-bg-card rounded-xl border border-border-light p-5">
              <div className="text-sm text-text-muted mb-1">{t('stats.walletTotal')}</div>
              <div className="text-3xl font-bold mb-2">{stats.walletTotal}</div>
              {distributionEntries(stats.walletChainDistribution).length > 0 && (
                <div className="space-y-1">
                  {distributionEntries(stats.walletChainDistribution).map(([chain, count]) => (
                    <div key={chain} className="flex items-center justify-between text-xs">
                      <span className="text-text-muted">{chain}</span>
                      <span className="font-medium text-text-primary">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 代理总数卡片（含协议分布明细） */}
            <div className="bg-bg-card rounded-xl border border-border-light p-5">
              <div className="text-sm text-text-muted mb-1">{t('stats.proxyTotal')}</div>
              <div className="text-3xl font-bold mb-2">{stats.proxyTotal}</div>
              {distributionEntries(stats.proxyProtocolDistribution).length > 0 && (
                <div className="space-y-1">
                  {distributionEntries(stats.proxyProtocolDistribution).map(([proto, count]) => (
                    <div key={proto} className="flex items-center justify-between text-xs">
                      <span className="text-text-muted">{proto.toUpperCase()}</span>
                      <span className="font-medium text-text-primary">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 任务总数卡片（含状态分布明细） */}
            <div className="bg-bg-card rounded-xl border border-border-light p-5">
              <div className="text-sm text-text-muted mb-1">{t('stats.taskTotal')}</div>
              <div className="text-3xl font-bold mb-2">{stats.taskTotal}</div>
              {distributionEntries(stats.taskStatusDistribution).length > 0 && (
                <div className="space-y-1">
                  {distributionEntries(stats.taskStatusDistribution).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between text-xs">
                      <span className="text-text-muted">{statusLabel('task', status, t)}</span>
                      <span className="font-medium text-text-primary">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 任务成功率卡片（含完成/失败明细） */}
            <div className="bg-bg-card rounded-xl border border-border-light p-5">
              <div className="text-sm text-text-muted mb-1">{t('stats.successRate')}</div>
              <div className="text-3xl font-bold mb-2">{formatRate(stats.taskSuccessRate)}</div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted">{statusLabel('task', 'complete', t)}</span>
                  <span className="font-medium text-success">{stats.taskCompletedCount}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted">{statusLabel('task', 'error', t)}</span>
                  <span className="font-medium text-danger">{stats.taskErrorCount}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 任务耗时分布条形图 */}
          {Object.keys(stats.taskDurationDistribution || {}).length > 0 && (
            <div className="bg-bg-card rounded-xl border border-border-light p-5">
              <h2 className="text-base font-semibold mb-4">{t('stats.taskDuration')}</h2>
              <div className="space-y-2">
                {Object.entries(stats.taskDurationDistribution || {})
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([range, count]) => {
                    const maxCount = Math.max(
                      ...Object.values(stats.taskDurationDistribution || {})
                    )
                    const widthPercent = maxCount > 0 ? (count / maxCount) * 100 : 0
                    return (
                      <div key={range} className="flex items-center gap-3">
                        <span className="text-sm text-text-secondary w-32 shrink-0">{range}</span>
                        <div className="flex-1 h-6 bg-bg-tertiary rounded overflow-hidden">
                          <div
                            className="h-full bg-primary rounded transition-all"
                            style={{ width: `${widthPercent}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-text-primary w-12 text-right">
                          {count}
                        </span>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* 模板使用排行表 */}
          {(stats.templateUsage || []).length > 0 && (
            <div className="bg-bg-card rounded-xl border border-border-light p-5">
              <h2 className="text-base font-semibold mb-4">{t('stats.templateUsage')}</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-light">
                    <th className="text-left px-4 py-2 font-medium text-text-secondary">
                      {t('stats.templateName')}
                    </th>
                    <th className="text-right px-4 py-2 font-medium text-text-secondary">
                      {t('stats.taskCount')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(stats.templateUsage || []).map((item, i) => (
                    <tr
                      key={i}
                      className="border-b border-border-light/50 hover:bg-bg-card-hover transition-colors"
                    >
                      <td className="px-4 py-2">{item.name || item.id || '-'}</td>
                      <td className="px-4 py-2 text-right font-medium">{item.taskCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 模板成功率排名表 */}
          {(stats.templateRanking || []).length > 0 && (
            <div className="bg-bg-card rounded-xl border border-border-light p-5">
              <h2 className="text-base font-semibold mb-4">{t('stats.templateRanking')}</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-light">
                    <th className="text-left px-4 py-2 font-medium text-text-secondary">
                      {t('stats.templateName')}
                    </th>
                    <th className="text-right px-4 py-2 font-medium text-text-secondary">
                      {t('stats.successCount')}
                    </th>
                    <th className="text-right px-4 py-2 font-medium text-text-secondary">
                      {t('stats.errorCount')}
                    </th>
                    <th className="text-right px-4 py-2 font-medium text-text-secondary">
                      {t('stats.successRate')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(stats.templateRanking || []).map((item, i) => (
                    <tr
                      key={i}
                      className="border-b border-border-light/50 hover:bg-bg-card-hover transition-colors"
                    >
                      <td className="px-4 py-2">{item.name || item.id || '-'}</td>
                      <td className="px-4 py-2 text-right text-success font-medium">
                        {item.successCount}
                      </td>
                      <td className="px-4 py-2 text-right text-danger font-medium">
                        {item.errorCount}
                      </td>
                      <td className="px-4 py-2 text-right font-medium">
                        {formatRate(item.successRate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default Stats

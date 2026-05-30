import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  Wallet,
  User,
  Globe,
  Zap,
  RefreshCw,
  Activity,
  CheckCircle,
  XCircle,
  Plus,
  ArrowRight,
  Clock,
  TrendingUp,
  Layers,
  Target,
  Shield
} from 'lucide-react'
import type { TFunction } from 'i18next'
import { appApi, airdropApi } from '../api'
import type { StatsAggregate, AirdropProject } from '../types'
import { statusLabel } from '../utils/i18n-status'
import { useAuth } from '../contexts/AuthContext'

const statusIcons: Record<string, React.ReactNode> = {
  running: <Activity className="w-4 h-4 animate-pulse" />,
  complete: <CheckCircle className="w-4 h-4" />,
  error: <XCircle className="w-4 h-4" />,
  idle: <Clock className="w-4 h-4" />,
  paused: <Clock className="w-4 h-4" />,
  stopped: <XCircle className="w-4 h-4" />
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  trend
}: {
  icon: React.ElementType
  label: string
  value: number | string
  color: string
  trend?: { value: number; isUp: boolean }
}): React.JSX.Element {
  return (
    <div className="bg-bg-card rounded-xl p-6 border border-border-light hover:border-primary/30 transition-all duration-300">
      <div className="flex items-center justify-between">
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="w-6 h-6" />
        </div>
        {trend && (
          <div
            className={`flex items-center gap-1 text-sm ${trend.isUp ? 'text-success' : 'text-danger'}`}
          >
            <TrendingUp className={`w-4 h-4 ${trend.isUp ? '' : 'rotate-180'}`} />
            <span>{trend.value}%</span>
          </div>
        )}
      </div>
      <div className="mt-4">
        <p className="text-text-muted text-sm">{label}</p>
        <p className="text-2xl font-bold mt-1 text-text-primary">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
      </div>
    </div>
  )
}

function StatusBadge({ status, label }: { status: string; label: string }): React.JSX.Element {
  const statusClass = `bg-status-${status}-bg text-status-${status}-text border-status-${status}-text/20`

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusClass} border`}
    >
      {statusIcons[status] || statusIcons.idle}
      {label}
    </span>
  )
}

function QuickActionButton({
  icon: Icon,
  label,
  onClick
}: {
  icon: React.ElementType
  label: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-4 rounded-xl bg-bg-card border border-border-light hover:border-primary/50 hover:bg-bg-card-hover transition-all duration-200"
    >
      <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
        <Icon className="w-5 h-5" />
      </div>
      <span className="font-medium text-text-primary">{label}</span>
    </button>
  )
}

function AirdropCard({ airdrop, t }: { airdrop: AirdropProject; t: TFunction }): React.JSX.Element {
  const statusColors: Record<string, string> = {
    ongoing: 'bg-primary',
    completed: 'bg-success',
    cancelled: 'bg-danger',
    claimed: 'bg-purple-500'
  }

  const typeColors: Record<string, string> = {
    testnet: 'bg-cyan-500',
    mainnet: 'bg-primary',
    galxe: 'bg-warning',
    quest: 'bg-purple-500',
    social: 'bg-pink-500',
    other: 'bg-bg-tertiary0'
  }

  return (
    <div className="bg-bg-card rounded-xl p-5 border border-border-light hover:border-primary/30 transition-all duration-200">
      <div className="flex items-start justify-between mb-3">
        <h4 className="font-semibold text-text-primary">{airdrop.name}</h4>
        <span
          className={`w-2.5 h-2.5 rounded-full ${statusColors[airdrop.status] || 'bg-bg-tertiary0'}`}
        />
      </div>
      <p className="text-sm text-text-secondary mb-4 line-clamp-2">{airdrop.description}</p>
      <div className="flex flex-wrap gap-2">
        <span className="px-2 py-1 rounded-md text-xs bg-primary/20 text-primary">
          {airdrop.chain}
        </span>
        <span
          className={`px-2 py-1 rounded-md text-xs ${statusColors[airdrop.status] || 'bg-bg-tertiary0'}/20 text-white/80`}
        >
          {statusLabel('airdrop', airdrop.status, t)}
        </span>
        <span
          className={`px-2 py-1 rounded-md text-xs ${typeColors[airdrop.projectType] || 'bg-bg-tertiary0'}/20 text-white/80`}
        >
          {statusLabel('airdropType', airdrop.projectType, t)}
        </span>
      </div>
    </div>
  )
}

const roleBannerColors: Record<string, string> = {
  admin: 'bg-purple-500/10 border-purple-500/30 text-purple-600',
  developer: 'bg-primary/10 border-primary/30 text-primary',
  user: 'bg-success/10 border-success/30 text-success'
}

export default function Dashboard(): React.JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [stats, setStats] = useState<StatsAggregate | null>(null)
  const [airdrops, setAirdrops] = useState<AirdropProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = useCallback(async (): Promise<void> => {
    try {
      setError(null)
      setRefreshing(true)

      const results = await Promise.allSettled([
        appApi.getInfo(),
        appApi.getStats(),
        airdropApi.list(1, 4, '')
      ])

      const statsData = results[1].status === 'fulfilled' ? results[1].value : null
      const airdropsData = results[2].status === 'fulfilled' ? results[2].value : null

      setStats(statsData)
      setAirdrops(airdropsData?.items || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.operationFailed'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [t])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <XCircle className="w-12 h-12 text-danger" />
        <p className="text-text-secondary">{error}</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors"
        >
          {t('common.retry')}
        </button>
      </div>
    )
  }

  const ongoingAirdrops = airdrops.filter((a) => a.status === 'ongoing')

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t('dashboard.title')}</h1>
          <p className="text-text-muted mt-1">{t('dashboard.refresh.title')}</p>
        </div>
        <button
          onClick={fetchData}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-bg-card border border-border-light rounded-lg hover:border-primary/50 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </button>
      </div>

      {user && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${roleBannerColors[user.role] || 'bg-bg-card border-border-light'}`}>
          <Shield className="w-5 h-5 shrink-0" />
          <div>
            <span className="text-sm font-medium">
              {user.displayName}
            </span>
            <span className="text-xs ml-2 opacity-70">
              ({user.role === 'admin' ? '管理员' : user.role === 'developer' ? '开发者' : '用户'})
            </span>
            <span className="text-xs ml-2 opacity-60">
              — {t(`dashboard.roleMessage.${user.role}`)}
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Wallet}
          label={t('dashboard.stats.wallets')}
          value={stats?.walletTotal || 0}
          color="bg-primary/10 text-primary"
        />
        <StatCard
          icon={User}
          label={t('dashboard.stats.accounts')}
          value={stats?.accountTotal || 0}
          color="bg-purple-500/10 text-purple-600"
        />
        <StatCard
          icon={Globe}
          label={t('dashboard.stats.proxies')}
          value={stats?.proxyTotal || 0}
          color="bg-cyan-500/10 text-cyan-600"
        />
        <StatCard
          icon={Zap}
          label={t('dashboard.stats.tasks')}
          value={stats?.taskTotal || 0}
          color="bg-amber-500/10 text-amber-600"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-bg-card rounded-xl p-6 border border-border-light">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-text-primary">
            <Layers className="w-5 h-5 text-primary" />
            {t('dashboard.taskStatusDistribution')}
          </h2>

          {stats?.taskStatusDistribution ? (
            <div className="space-y-3">
              {Object.entries(stats.taskStatusDistribution).map(([status, count]) => (
                <div key={status} className="flex items-center gap-3">
                  <StatusBadge status={status} label={statusLabel('task', status, t)} />
                  <div className="flex-1 h-2 bg-bg-tertiary rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-status-${status}-bg`}
                      style={{ width: `${(count / (stats.taskTotal || 1)) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm text-text-secondary w-12 text-right">{count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-text-muted text-center py-8">{t('common.noData')}</p>
          )}
        </div>

        <div className="bg-bg-card rounded-xl p-6 border border-border-light">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-text-primary">
            <Target className="w-5 h-5 text-primary" />
            {t('dashboard.quickActions')}
          </h2>
          <div className="space-y-3">
            <QuickActionButton
              icon={Wallet}
              label={t('dashboard.createWallet')}
              onClick={() => navigate('/wallets')}
            />
            <QuickActionButton
              icon={Zap}
              label={t('dashboard.createTask')}
              onClick={() => navigate('/tasks')}
            />
            <QuickActionButton
              icon={Globe}
              label={t('dashboard.addProxy')}
              onClick={() => navigate('/proxies')}
            />
            <QuickActionButton
              icon={Plus}
              label={t('dashboard.addAirdrop')}
              onClick={() => navigate('/airdrops')}
            />
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2 text-text-primary">
            <Activity className="w-5 h-5 text-primary" />
            {t('dashboard.airdropOverview')}
          </h2>
          <button
            onClick={() => navigate('/airdrops')}
            className="flex items-center gap-1 text-sm text-primary hover:text-primary-hover transition-colors"
          >
            {t('common.viewAll')}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {ongoingAirdrops.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {ongoingAirdrops.map((airdrop) => (
              <AirdropCard key={airdrop.id} airdrop={airdrop} t={t} />
            ))}
          </div>
        ) : (
          <div className="bg-bg-card rounded-xl p-12 border border-border-light text-center">
            <Clock className="w-12 h-12 text-text-muted mx-auto mb-4" />
            <p className="text-text-muted">{t('dashboard.noRecentActivity')}</p>
          </div>
        )}
      </div>

      {stats?.recentTaskResults && stats.recentTaskResults.length > 0 && (
        <div className="bg-bg-card rounded-xl p-6 border border-border-light">
          <h2 className="text-lg font-semibold mb-4 text-text-primary">
            {t('dashboard.recentActivity')}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border-light">
                  <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">
                    {t('tasks.scriptFolder')}
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">
                    {t('common.status')}
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">
                    {t('tasks.startTime')}
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">
                    {t('tasks.endTime')}
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">
                    {t('common.duration')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.recentTaskResults.map((task, index) => (
                  <tr
                    key={index}
                    className="border-b border-border-light/50 hover:bg-bg-card-hover transition-colors"
                  >
                    <td className="py-3 px-4 text-sm text-text-primary max-w-xs truncate">
                      {task.scriptFolder}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge
                        status={task.status}
                        label={statusLabel('task', task.status, t)}
                      />
                    </td>
                    <td className="py-3 px-4 text-sm text-text-secondary">
                      {task.startedAt ? new Date(task.startedAt).toLocaleString('zh-CN') : '-'}
                    </td>
                    <td className="py-3 px-4 text-sm text-text-secondary">
                      {task.endedAt ? new Date(task.endedAt).toLocaleString('zh-CN') : '-'}
                    </td>
                    <td className="py-3 px-4 text-sm text-text-secondary">
                      {task.durationSecs != null ? `${task.durationSecs}s` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

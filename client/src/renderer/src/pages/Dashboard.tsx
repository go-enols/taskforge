/**
 * @file Dashboard — 仪表盘页面（任务自动化中心）
 * @description 系统首页，展示任务相关的 KPI 统计（进行中/今日完成/今日失败/已安装脚本）、
 *              任务时间线（最近 24h 事件）、市场更新和快捷操作入口。
 *              不再显示钱包数或空投项目概览（已改为任务自动化为中心）。
 * @module renderer/pages
 */

import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  CheckCircle,
  XCircle,
  User,
  Globe,
  Zap,
  ShoppingBag,
  PackageOpen,
  ArrowRight,
  RefreshCw,
  Clock
} from 'lucide-react'
import { toast } from 'sonner'
import { taskApi, scriptApi, marketplaceApi } from '../api'
import type { Task, InstalledScript, RemoteScript } from '../types'
import { statusLabel } from '../utils/i18n-status'
import { useAuth } from '../contexts/AuthContext'
import Skeleton from '../components/common/Skeleton'

/** 任务状态到对应图标的映射 */
const statusIcons: Record<string, React.ReactNode> = {
  running: <Activity className="w-4 h-4 animate-pulse" />,
  complete: <CheckCircle className="w-4 h-4" />,
  error: <XCircle className="w-4 h-4" />,
  idle: <Clock className="w-4 h-4" />,
  paused: <Clock className="w-4 h-4" />,
  stopped: <XCircle className="w-4 h-4" />
}

/**
 * StatCard — 统计卡片组件
 *
 * 显示单一统计指标，包含图标、标签和数值。
 */
function StatCard({
  icon: Icon,
  label,
  value,
  color,
  loading = false
}: {
  icon: React.ElementType
  label: string
  value: number | string
  color: string
  loading?: boolean
}): React.JSX.Element {
  return (
    <div className="bg-bg-card rounded-xl p-6 border border-border-light hover:border-primary/30 transition-all duration-300">
      <div className="flex items-center gap-3">
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
      <div className="mt-4">
        <p className="text-text-muted text-sm">{label}</p>
        {loading ? (
          <Skeleton className="h-8 w-16 mt-1" />
        ) : (
          <p className="text-2xl font-bold mt-1 text-text-primary">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * StatusBadge — 状态徽章组件
 *
 * 根据任务状态显示对应颜色的圆角徽章（含状态图标）。
 */
function StatusBadge({
  status,
  label
}: {
  status: string
  label: string
}): React.JSX.Element {
  const statusClass =
    status === 'running'
      ? 'bg-status-running-bg text-status-running-text border-status-running-border'
      : status === 'complete'
        ? 'bg-status-complete-bg text-status-complete-text border-status-complete-border'
        : status === 'error'
          ? 'bg-status-error-bg text-status-error-text border-status-error-border'
          : 'bg-bg-tertiary text-text-muted border-border-light'

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusClass} border`}
    >
      {statusIcons[status] || statusIcons.idle}
      {label}
    </span>
  )
}

/**
 * QuickActionButton — 快捷操作按钮
 */
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
      className="flex flex-col items-center gap-3 p-5 bg-bg-card border border-border-light rounded-xl hover:border-primary/40 hover:bg-bg-hover transition-all duration-200 group"
    >
      <div className="p-3 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <span className="text-sm font-medium text-text-primary">{label}</span>
    </button>
  )
}

/**
 * isToday — 判断 ISO 字符串是否属于今天（本地时区）
 */
function isToday(iso: string | null): boolean {
  if (!iso) return false
  const d = new Date(iso)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

interface MarketUpdateItem {
  name: string
  version: string
  author: string | null
  updatedAt: string
}

/**
 * Dashboard — 仪表盘主页面
 *
 * 四个区域：
 * 1. 顶部 — 4 个任务相关 KPI 卡片
 * 2. 中部 — 最近 24h 任务时间线
 * 3. 右侧 — 市场最新脚本更新
 * 4. 底部 — 4 个快捷操作按钮
 */
export default function Dashboard(): React.JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [tasks, setTasks] = useState<Task[]>([])
  const [installedScripts, setInstalledScripts] = useState<InstalledScript[]>([])
  const [marketUpdates, setMarketUpdates] = useState<MarketUpdateItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  /** 构建 scriptFolder → 脚本名称映射 */
  const scriptNameMap = React.useMemo(() => {
    const map: Record<string, string> = {}
    for (const s of installedScripts) {
      map[s.installPath] = s.name
    }
    return map
  }, [installedScripts])

  /** 获取任务名称（优先从已安装脚本映射中查找） */
  const getTaskName = (task: Task): string => {
    return scriptNameMap[task.scriptFolder] || task.scriptFolder
  }

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [taskResult, installedResult, marketResult] = await Promise.allSettled([
        taskApi.list(1, 9999),
        scriptApi.listInstalled(),
        marketplaceApi.listScripts()
      ])

      if (taskResult.status === 'fulfilled') {
        setTasks(taskResult.value.items)
      } else {
        toast.error('获取任务数据失败')
        console.error(taskResult.reason)
      }

      if (installedResult.status === 'fulfilled') {
        setInstalledScripts(installedResult.value)
      } else {
        toast.error('获取脚本列表失败')
        console.error(installedResult.reason)
      }

      if (marketResult.status === 'fulfilled') {
        const sorted = [...marketResult.value.items]
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
          .slice(0, 5)
          .map((s: RemoteScript) => ({
            name: s.name,
            version: s.version,
            author: s.createdByName ?? null,
            updatedAt: s.updatedAt
          }))
        setMarketUpdates(sorted)
      } else {
        // 市场数据拉取失败不阻塞页面
        console.error(marketResult.reason)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      toast.error(`数据加载失败: ${message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }

  // --- KPI 计算 ---

  const runningTasks = tasks.filter((t) => t.status === 'running').length
  const completedToday = tasks.filter((t) => t.status === 'complete' && isToday(t.endedAt)).length
  const failedToday = tasks.filter((t) => t.status === 'error' && isToday(t.endedAt)).length
  const installedScriptCount = installedScripts.length

  // --- 任务时间线（最近 24h） ---

  const now = Date.now()
  const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000

  const timelineTasks = tasks
    .filter((t) => t.startedAt && new Date(t.startedAt).getTime() >= twentyFourHoursAgo)
    .sort((a, b) => {
      if (!a.startedAt || !b.startedAt) return 0
      return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    })
    .slice(0, 20)

  // Error state
  if (error && !loading && tasks.length === 0 && installedScripts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <XCircle className="w-16 h-16 text-danger/60" />
        <p className="text-text-muted text-lg">{t('common.error')}</p>
        <p className="text-text-muted text-sm">{error}</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-primary rounded-lg text-sm font-medium hover:bg-primary/80 transition-colors"
        >
          {t('common.retry')}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t('dashboard.title')}</h1>
          <p className="text-text-muted text-sm mt-1">{t('dashboard.refresh.title')}</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-bg-card border border-border-light rounded-lg hover:border-primary/40 transition-colors text-sm text-text-secondary disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </button>
      </div>

      {/* 当前用户角色横幅 */}
      {user && (
        <div className="bg-bg-card border border-border-light rounded-xl p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-medium text-text-primary">
              {user.displayName || user.username}
              <span className="text-text-muted font-normal ml-1">
                — {t(`dashboard.roleMessage.${user.role}`)}
              </span>
            </p>
          </div>
        </div>
      )}

      {/* 区域 1: KPI 卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Activity}
          label={t('dashboard.runningTasks')}
          value={runningTasks}
          color="bg-amber-500/10 text-amber-500"
          loading={loading}
        />
        <StatCard
          icon={CheckCircle}
          label={t('dashboard.completedToday')}
          value={completedToday}
          color="bg-emerald-500/10 text-emerald-500"
          loading={loading}
        />
        <StatCard
          icon={XCircle}
          label={t('dashboard.failedToday')}
          value={failedToday}
          color="bg-red-500/10 text-red-500"
          loading={loading}
        />
        <StatCard
          icon={PackageOpen}
          label={t('dashboard.installedScripts')}
          value={installedScriptCount}
          color="bg-violet-500/10 text-violet-500"
          loading={loading}
        />
      </div>

      {/* 区域 2 & 3: 任务时间线 + 市场更新 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 任务时间线 */}
        <div className="lg:col-span-2 bg-bg-card border border-border-light rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              {t('dashboard.taskTimeline')}
            </h2>
            <span className="text-xs text-text-muted">
              {t('common.total', { count: timelineTasks.length })}
            </span>
          </div>

          {loading ? (
            <Skeleton lines={5} className="h-12 mb-3" />
          ) : timelineTasks.length === 0 ? (
            <div className="text-center py-12 text-text-muted">
              <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{t('dashboard.noRecentActivity')}</p>
            </div>
          ) : (
            <div className="max-h-[400px] overflow-y-auto space-y-0">
              <table className="w-full text-sm">
                <thead className="text-text-muted border-b border-border-light sticky top-0 bg-bg-card z-10">
                  <tr>
                    <th className="text-left pb-2 font-medium">{t('tasks.scriptFolder')}</th>
                    <th className="text-left pb-2 font-medium">{t('common.status')}</th>
                    <th className="text-left pb-2 font-medium">{t('tasks.startTime')}</th>
                    <th className="text-left pb-2 font-medium">{t('tasks.endTime')}</th>
                  </tr>
                </thead>
                <tbody>
                  {timelineTasks.map((task) => (
                    <tr key={task.id} className="border-b border-border-light/50 hover:bg-bg-hover/50 transition-colors">
                      <td className="py-2.5 pr-3 text-text-primary max-w-[200px] truncate" title={getTaskName(task)}>
                        {getTaskName(task)}
                      </td>
                      <td className="py-2.5 pr-3">
                        <StatusBadge
                          status={task.status}
                          label={statusLabel('task', task.status, t)}
                        />
                      </td>
                      <td className="py-2.5 pr-3 text-text-muted whitespace-nowrap">
                        {task.startedAt ? new Date(task.startedAt).toLocaleString('zh-CN') : '-'}
                      </td>
                      <td className="py-2.5 text-text-muted whitespace-nowrap">
                        {task.endedAt ? new Date(task.endedAt).toLocaleString('zh-CN') : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 市场更新 */}
        <div className="bg-bg-card border border-border-light rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-primary" />
              {t('dashboard.marketUpdates')}
            </h2>
            <button
              onClick={() => navigate('/marketplace')}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              {t('common.viewAll')}
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {loading ? (
            <Skeleton lines={5} className="h-14 mb-3" />
          ) : marketUpdates.length === 0 ? (
            <div className="text-center py-8 text-text-muted">
              <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs">{t('common.noData')}</p>
            </div>
          ) : (
            <ul className="space-y-4">
              {marketUpdates.map((item, idx) => (
                <li
                  key={idx}
                  className="pb-4 border-b border-border-light last:border-0 last:pb-0"
                >
                  <p className="text-sm font-medium text-text-primary">{item.name}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
                    <span>v{item.version}</span>
                    {item.author && <span>{item.author}</span>}
                  </div>
                  <p className="text-xs text-text-muted mt-0.5">
                    {new Date(item.updatedAt).toLocaleString('zh-CN')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 区域 4: 快捷操作 */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          {t('dashboard.quickActions')}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <QuickActionButton
            icon={User}
            label={t('dashboard.createAccount')}
            onClick={() => navigate('/data/accounts')}
          />
          <QuickActionButton
            icon={Zap}
            label={t('dashboard.createTask')}
            onClick={() => navigate('/tasks')}
          />
          <QuickActionButton
            icon={Globe}
            label={t('dashboard.addProxy')}
            onClick={() => navigate('/data/proxies')}
          />
          <QuickActionButton
            icon={ShoppingBag}
            label={t('dashboard.browseMarketplace')}
            onClick={() => navigate('/marketplace')}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * @file Dashboard — 仪表盘页面（任务自动化中心 / 平台治理中心）
 * @description 系统首页，按用户角色展示不同的视角：
 *              admin   — 平台治理（用户数、脚本数、待审核、治理快捷入口）
 *              developer — 脚本开发视角（安装脚本、任务时间线、市场更新、开发快捷入口）
 *              user     — 任务运营视角（进行中任务、时间线、市场更新、操作快捷入口）
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
  RefreshCw,
  Clock,
  Shield,
  Users,
  ScrollText,
  Code,
  FileCheck,
  FolderGit2
} from 'lucide-react'
import { toast } from 'sonner'
import { taskApi, scriptApi, marketplaceApi, logApi, appApi } from '../api'
import type { Task, InstalledScript, RemoteScript, AppLog } from '../types'
import { statusLabel } from '../utils/i18n-status'
import { useAuth, type UserRole } from '../contexts/AuthContext'
import Skeleton from '../components/common/Skeleton'

/** 开发/用户角色允许导航的页面列表（admin 被限制进入运营页面） */
const OPERATIONAL_ROUTES: UserRole[] = ['developer', 'user']

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

interface PendingReviewItem {
  id: string
  name: string
  version: string
  author: string | null
  reviewStatus: string
  updatedAt: string
}

/**
 * Dashboard — 仪表盘主页面
 *
 * 按角色提供三种视图：
 * - admin：平台治理 KPI + 待审核列表 + 系统日志摘要 + 治理快捷入口
 * - developer：脚本开发 KPI + 任务时间线 + 市场更新 + 开发快捷入口
 * - user：运营 KPI + 任务时间线 + 市场更新 + 操作快捷入口
 */
export default function Dashboard(): React.JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, isAdmin } = useAuth()

  const [tasks, setTasks] = useState<Task[]>([])
  const [installedScripts, setInstalledScripts] = useState<InstalledScript[]>([])
  const [marketUpdates, setMarketUpdates] = useState<MarketUpdateItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // Admin-specific state
  const [userCount, setUserCount] = useState<number>(0)
  const [scriptCount, setScriptCount] = useState<number>(0)
  const [pendingCount, setPendingCount] = useState<number>(0)
  const [pendingReviews, setPendingReviews] = useState<PendingReviewItem[]>([])
  const [errorLogs, setErrorLogs] = useState<AppLog[]>([])

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
      if (isAdmin) {
        // Admin 平台视角：用户数、脚本总数、待审核、今日失败任务
        const [
          usersResult,
          scriptsResult,
          pendingResult,
          taskResult,
          logsResult
        ] = await Promise.allSettled([
          marketplaceApi.listUsers(),
          marketplaceApi.listScripts(),
          marketplaceApi.getPendingScripts(),
          taskApi.list(1, 9999),
          logApi.query('error', undefined, undefined, undefined, undefined, 5)
        ])
        // 后台静默获取本地统计（不与 Marketplace 绑定），后续可引入到 UI
        appApi.getStats().catch(() => {})

        if (usersResult.status === 'fulfilled') {
          setUserCount(usersResult.value.total ?? usersResult.value.items.length)
        } else {
          console.error('获取用户数据失败', usersResult.reason)
        }

        if (scriptsResult.status === 'fulfilled') {
          setScriptCount(scriptsResult.value.total)
        } else {
          console.error('获取脚本数据失败', scriptsResult.reason)
        }

        if (pendingResult.status === 'fulfilled') {
          const data = pendingResult.value
          const items = (data as { data?: { items?: PendingReviewItem[] } }).data?.items ??
                        (data as { items?: PendingReviewItem[] }).items ??
                        (Array.isArray(data) ? data : [])
          setPendingCount(items.length)
          setPendingReviews(items.slice(0, 10))
        } else {
          console.error('获取待审核数据失败', pendingResult.reason)
        }

        if (taskResult.status === 'fulfilled') {
          setTasks(taskResult.value.items)
        } else {
          console.error('获取任务数据失败', taskResult.reason)
        }

        if (logsResult.status === 'fulfilled') {
          setErrorLogs(logsResult.value.items.slice(0, 5))
        } else {
          console.error('获取日志数据失败', logsResult.reason)
        }
      } else {
        // Developer/User 运营视角
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
          console.error(marketResult.reason)
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      toast.error(`数据加载失败: ${message}`)
    } finally {
      setLoading(false)
    }
  }

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchData()
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }

  /** 带角色校验的导航：防御越权访问 */
  const safeNavigate = (path: string, allowedRoles: UserRole[]) => {
    if (user && !allowedRoles.includes(user.role)) {
      toast.warning(t('common.permissionDenied'))
      return
    }
    navigate(path)
  }

  const runningTasks = tasks.filter((t) => t.status === 'running').length
  const completedToday = tasks.filter((t) => t.status === 'complete' && isToday(t.endedAt)).length
  const failedToday = tasks.filter((t) => t.status === 'error' && isToday(t.endedAt)).length
  const installedScriptCount = installedScripts.length

  /** 24h 截止时间戳（组件首次渲染时计算一次） */
  const [twentyFourHoursAgo] = useState(() => Date.now() - 24 * 60 * 60 * 1000)

  const timelineTasks = tasks
    .filter((t) => t.startedAt && new Date(t.startedAt).getTime() >= twentyFourHoursAgo)
    .sort((a, b) => {
      if (!a.startedAt || !b.startedAt) return 0
      return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    })
    .slice(0, 20)

  // --- 完全加载失败（无任何数据）时的兜底页 ---
  if (error && !loading && tasks.length === 0 && installedScripts.length === 0 && (!isAdmin || userCount === 0)) {
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
      {/* ────── 页头 ────── */}
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

      {/* ────── 用户角色横幅 ────── */}
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

      {/* ══════════════════════════════════════════════
          ADMIN 视图
          ══════════════════════════════════════════════ */}
      {isAdmin && (
        <>
          {/* 区域 1：平台 KPI 卡片 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={Users}
              label={t('dashboard.adminKpi.users')}
              value={userCount}
              color="bg-blue-500/10 text-blue-500"
              loading={loading}
            />
            <StatCard
              icon={PackageOpen}
              label={t('dashboard.adminKpi.scripts')}
              value={scriptCount}
              color="bg-violet-500/10 text-violet-500"
              loading={loading}
            />
            <StatCard
              icon={FileCheck}
              label={t('dashboard.adminKpi.pendingReviews')}
              value={pendingCount}
              color="bg-amber-500/10 text-amber-500"
              loading={loading}
            />
            <StatCard
              icon={XCircle}
              label={t('dashboard.adminKpi.failedTasks')}
              value={failedToday}
              color="bg-red-500/10 text-red-500"
              loading={loading}
            />
          </div>

          {/* 区域 2 & 3：待审核列表 + 系统日志 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 待审核列表 */}
            <div className="lg:col-span-2 bg-bg-card border border-border-light rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                  <Shield className="w-5 h-5 text-amber-500" />
                  {t('dashboard.pendingReviews')}
                </h2>
                <span className="text-xs text-text-muted">
                  {t('common.total', { count: pendingReviews.length })}
                </span>
              </div>

              {loading ? (
                <Skeleton lines={5} className="h-12 mb-3" />
              ) : pendingReviews.length === 0 ? (
                <div className="text-center py-12 text-text-muted">
                  <FileCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">{t('common.noData')}</p>
                </div>
              ) : (
                <div className="max-h-[400px] overflow-y-auto space-y-0">
                  <table className="w-full text-sm">
                    <thead className="text-text-muted border-b border-border-light sticky top-0 bg-bg-card z-10">
                      <tr>
                        <th className="text-left pb-2 font-medium">{t('templates.name')}</th>
                        <th className="text-left pb-2 font-medium">{t('templates.version')}</th>
                        <th className="text-left pb-2 font-medium">{t('common.status')}</th>
                        <th className="text-left pb-2 font-medium">{t('templates.updatedAt')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-light">
                      {pendingReviews.map((item) => (
                        <tr key={item.id} className="hover:bg-bg-hover transition-colors">
                          <td className="py-3 pr-2 font-medium text-text-primary">
                            {item.name}
                            {item.author && (
                              <span className="text-text-muted font-normal text-xs ml-1">
                                by {item.author}
                              </span>
                            )}
                          </td>
                          <td className="py-3 pr-2 text-text-secondary">v{item.version}</td>
                          <td className="py-3 pr-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20">
                              {item.reviewStatus || 'pending'}
                            </span>
                          </td>
                          <td className="py-3 text-text-muted">
                            {new Date(item.updatedAt).toLocaleString('zh-CN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 系统日志摘要 */}
            <div className="bg-bg-card border border-border-light rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                  <ScrollText className="w-5 h-5 text-danger/70" />
                  {t('dashboard.errorLogSummary')}
                </h2>
                <button
                  onClick={() => safeNavigate('/logs', ['admin'])}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  {t('common.viewAll')}
                </button>
              </div>

              {loading ? (
                <Skeleton lines={5} className="h-10 mb-2" />
              ) : errorLogs.length === 0 ? (
                <div className="text-center py-8 text-text-muted">
                  <CheckCircle className="w-8 h-8 mx-auto mb-2 text-emerald-500/50" />
                  <p className="text-xs">{t('dashboard.noErrors')}</p>
                </div>
              ) : (
                <ul className="space-y-3 max-h-[360px] overflow-y-auto">
                  {errorLogs.map((log) => (
                    <li key={log.id} className="text-xs border-b border-border-light pb-2 last:border-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <XCircle className="w-3 h-3 text-danger flex-shrink-0" />
                        <span className="text-text-muted">
                          {new Date(log.timestamp).toLocaleString('zh-CN')}
                        </span>
                        <span className="text-text-muted/60">{log.category && `· ${log.category}`}</span>
                      </div>
                      <p className="text-text-secondary truncate">{log.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* 区域 4：治理快捷入口 */}
          <div>
            <h2 className="text-lg font-semibold text-text-primary mb-4">{t('dashboard.quickActions')}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <QuickActionButton
                icon={Shield}
                label={t('dashboard.adminActions.auditCenter')}
                onClick={() => safeNavigate('/admin', ['admin'])}
              />
              <QuickActionButton
                icon={Users}
                label={t('dashboard.adminActions.userManagement')}
                onClick={() => safeNavigate('/admin', ['admin'])}
              />
              <QuickActionButton
                icon={ScrollText}
                label={t('dashboard.adminActions.systemLogs')}
                onClick={() => safeNavigate('/admin', ['admin'])}
              />
              <QuickActionButton
                icon={ShoppingBag}
                label={t('dashboard.adminActions.marketplace')}
                onClick={() => safeNavigate('/marketplace', ['admin', 'developer', 'user'])}
              />
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════
          DEVELOPER / USER 视图（非 admin）
          ══════════════════════════════════════════════ */}
      {!isAdmin && (
        <>
          {/* 区域 1：KPI 卡片 */}
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

          {/* 区域 2 & 3：任务时间线 + 市场更新 */}
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
                    <tbody className="divide-y divide-border-light">
                      {timelineTasks.map((task) => (
                        <tr key={task.id} className="hover:bg-bg-hover transition-colors">
                          <td className="py-3 pr-2 font-medium text-text-primary">
                            {getTaskName(task)}
                          </td>
                          <td className="py-3 pr-2">
                            <StatusBadge
                              status={task.status}
                              label={statusLabel('task', task.status, t)}
                            />
                          </td>
                          <td className="py-3 pr-2 text-text-muted">
                            {task.startedAt ? new Date(task.startedAt).toLocaleString('zh-CN') : '-'}
                          </td>
                          <td className="py-3 text-text-muted">
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
                  <ShoppingBag className="w-5 h-5 text-violet-500" />
                  {t('dashboard.marketUpdates')}
                </h2>
                <button
                  onClick={() => safeNavigate('/marketplace', ['admin', 'developer', 'user'])}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  {t('common.viewAll')}
                </button>
              </div>

              {loading ? (
                <Skeleton lines={5} className="h-10 mb-2" />
              ) : marketUpdates.length === 0 ? (
                <div className="text-center py-8 text-text-muted">
                  <PackageOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">{t('common.noData')}</p>
                </div>
              ) : (
                <ul className="space-y-3 max-h-[360px] overflow-y-auto">
                  {marketUpdates.map((item, idx) => (
                    <li key={idx} className="border-b border-border-light pb-3 last:border-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-text-primary text-sm">{item.name}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-500">
                          v{item.version}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-text-muted">
                        {item.author && <span>{item.author}</span>}
                        <span>{new Date(item.updatedAt).toLocaleString('zh-CN')}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* ═══════════ 区域 4：快捷操作 — 按角色区分 ═══════════ */}
          {user?.role === 'developer' && (
            <div>
              <h2 className="text-lg font-semibold text-text-primary mb-4">{t('dashboard.quickActions')}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <QuickActionButton
                  icon={Code}
                  label={t('dashboard.devActions.scaffold')}
                  onClick={() => safeNavigate('/dev', ['admin', 'developer'])}
                />
                <QuickActionButton
                  icon={FileCheck}
                  label={t('dashboard.devActions.myPending')}
                  onClick={() => safeNavigate('/dev', ['admin', 'developer'])}
                />
                <QuickActionButton
                  icon={FolderGit2}
                  label={t('dashboard.devActions.myScripts')}
                  onClick={() => safeNavigate('/dev', ['admin', 'developer'])}
                />
                <QuickActionButton
                  icon={ShoppingBag}
                  label={t('dashboard.devActions.browseMarket')}
                  onClick={() => safeNavigate('/marketplace', ['admin', 'developer', 'user'])}
                />
              </div>
            </div>
          )}

          {user?.role === 'user' && (
            <div>
              <h2 className="text-lg font-semibold text-text-primary mb-4">{t('dashboard.quickActions')}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <QuickActionButton
                  icon={User}
                  label={t('dashboard.createScriptParam')}
                  onClick={() => safeNavigate('/data/params', OPERATIONAL_ROUTES)}
                />
                <QuickActionButton
                  icon={Zap}
                  label={t('dashboard.createTask')}
                  onClick={() => safeNavigate('/tasks', OPERATIONAL_ROUTES)}
                />
                <QuickActionButton
                  icon={Globe}
                  label={t('dashboard.addProxy')}
                  onClick={() => safeNavigate('/data/proxies', OPERATIONAL_ROUTES)}
                />
                <QuickActionButton
                  icon={ShoppingBag}
                  label={t('dashboard.browseMarketplace')}
                  onClick={() => safeNavigate('/marketplace', ['admin', 'developer', 'user'])}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

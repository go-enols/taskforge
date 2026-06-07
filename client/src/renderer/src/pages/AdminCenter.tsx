/**
 * @file AdminCenter — 管理中心（合并审核、用户管理、系统日志）
 * @description 管理员一站式控制台：
 *   - Tab 1: 脚本审核（原 AdminReviewPage 脚本 tab）
 *   - Tab 2: 模板审核（原 AdminReviewPage 模板 tab）
 *   - Tab 3: 用户管理（原 UserManagement）
 *   - Tab 4: 系统日志（原 Logs）
 * @module renderer/pages
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Shield,
  FileText,
  Users,
  ScrollText,
  Check,
  X,
  Clock,
  ChevronDown,
  ChevronRight,
  Download,
  RefreshCw,
  Trash2,
  Calendar,
  UserPlus,
  Copy,
  Eye,
  EyeOff,
  RotateCcw,
  Loader2,
  Edit3
} from 'lucide-react'
import { marketplaceApi, getMarketplaceUrl, getMarketplaceHeaders, logApi } from '../api'
import { useAuth } from '../contexts/AuthContext'
import { toast } from '../utils/toast'
import { ConfirmDialog, SearchInput } from '../components/common'
import { useDebounce } from '../hooks'
import type { RemoteScript, RemoteTemplate, AppLog, ListResponse } from '../types'

/* ═══════════════════════════════════════════
   Tab type
   ═══════════════════════════════════════════ */

type AdminTab = 'scripts' | 'templates' | 'users' | 'logs'

const TAB_ITEMS: { key: AdminTab; icon: typeof Shield; labelKey: string }[] = [
  { key: 'scripts', icon: Shield, labelKey: 'review.scripts' },
  { key: 'templates', icon: FileText, labelKey: 'review.templates' },
  { key: 'users', icon: Users, labelKey: 'userManagement.title' },
  { key: 'logs', icon: ScrollText, labelKey: 'logs.title' }
]

/* ═══════════════════════════════════════════
   User Management helpers
   ═══════════════════════════════════════════ */

interface User {
  id: string
  username: string
  displayName: string
  role: 'admin' | 'developer' | 'user'
  apiKey: string
  createdAt: string
  updatedAt: string
}

function maskKey(key: string): string {
  if (key.length <= 12) return key
  return `${key.slice(0, 8)}...${key.slice(-4)}`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  } catch {
    return iso
  }
}

const roleBadge: Record<string, string> = {
  admin: 'bg-purple/10 text-purple',
  developer: 'bg-primary/10 text-primary',
  user: 'bg-text-muted/10 text-text-muted'
}

/* ═══════════════════════════════════════════
   Logs helpers
   ═══════════════════════════════════════════ */

const INITIAL_LIMIT = 50

const levelColor: Record<string, string> = {
  debug: 'bg-bg-tertiary text-text-secondary',
  info: 'bg-primary-light text-primary',
  warn: 'bg-warning-light text-warning',
  error: 'bg-danger-light text-danger'
}

const LEVELS = ['debug', 'info', 'warn', 'error'] as const

const levelLabelKey: Record<string, string> = {
  debug: 'logs.levelDebug',
  info: 'logs.levelInfo',
  warn: 'logs.levelWarn',
  error: 'logs.levelError'
}

/* ═══════════════════════════════════════════
   Component
   ═══════════════════════════════════════════ */

export default function AdminCenter() {
  const { t } = useTranslation()
  const { isAdmin } = useAuth()

  /* ── Tab ── */
  const [activeTab, setActiveTab] = useState<AdminTab>('scripts')

  /* ── Review state (shared between scripts & templates tabs) ── */
  const [scripts, setScripts] = useState<RemoteScript[]>([])
  const [templates, setTemplates] = useState<RemoteTemplate[]>([])
  const [reviewLoading, setReviewLoading] = useState(true)
  const [reviewComment, setReviewComment] = useState('')
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

  /* ── User Management state ── */
  const [users, setUsers] = useState<User[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const [createForm, setCreateForm] = useState({ username: '', displayName: '', password: '', role: 'user' })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [editTarget, setEditTarget] = useState<User | null>(null)
  const [editForm, setEditForm] = useState({ displayName: '', password: '', role: 'user' })
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [regenerateTarget, setRegenerateTarget] = useState<User | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  /* ── Logs state ── */
  const [logData, setLogData] = useState<ListResponse<AppLog> | null>(null)
  const [logCategories, setLogCategories] = useState<string[]>([])
  const [logSearch, setLogSearch] = useState('')
  const debouncedLogSearch = useDebounce(logSearch, 300)
  const [logLevel, setLogLevel] = useState('')
  const [logCategory, setLogCategory] = useState('')
  const [logSince, setLogSince] = useState('')
  const [logUntil, setLogUntil] = useState('')
  const [logsLoading, setLogsLoading] = useState(false)
  const [logLimit, setLogLimit] = useState(INITIAL_LIMIT)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [clearingLogs, setClearingLogs] = useState(false)

  /* ═══════════════════════════════════════════
     Review logic
     ═══════════════════════════════════════════ */

  const toggleExpanded = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const fetchPending = useCallback(async () => {
    setReviewLoading(true)
    try {
      const [scriptsRes, templatesRes] = await Promise.all([
        marketplaceApi.getPendingScripts(),
        marketplaceApi.getPendingTemplates()
      ])
      setScripts(scriptsRes.data?.items || [])
      setTemplates(templatesRes.data?.items || [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '获取待审核项目失败')
    } finally {
      setReviewLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPending()
  }, [fetchPending])

  const handleReview = async (
    type: 'script' | 'template',
    id: string,
    action: 'approve' | 'reject'
  ) => {
    setReviewingId(id)
    try {
      if (type === 'script') {
        await marketplaceApi.reviewScript(id, action, reviewComment)
      } else {
        await marketplaceApi.reviewTemplate(id, action, reviewComment)
      }
      toast.success(action === 'approve' ? '已批准' : '已拒绝')
      setReviewComment('')
      fetchPending()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '审核失败')
    } finally {
      setReviewingId(null)
    }
  }

  const reviewType = (): 'script' | 'template' =>
    activeTab === 'scripts' ? 'script' : 'template'

  const downloadScript = async (item: RemoteScript) => {
    try {
      const base = await getMarketplaceUrl()
      const url = `${base}${item.downloadUrl}`
      window.open(url, '_blank')
    } catch {
      toast.error('获取下载链接失败')
    }
  }

  /* ═══════════════════════════════════════════
     User Management logic
     ═══════════════════════════════════════════ */

  const marketFetch = useCallback(async (method: string, path: string, body?: unknown) => {
    const base = await getMarketplaceUrl()
    const headers = await getMarketplaceHeaders()
    const opts: RequestInit = {
      method,
      headers: { ...headers, 'Content-Type': 'application/json' }
    }
    if (body !== undefined) opts.body = JSON.stringify(body)
    const resp = await fetch(`${base}${path}`, opts)
    if (!resp.ok) {
      const errBody = await resp.text()
      let msg: string
      try {
        const parsed = JSON.parse(errBody)
        const e = parsed.error
        msg = ((typeof e === 'object' && e !== null ? e.message : null) as string | null)
          ?? parsed?.message
          ?? (typeof e === 'string' ? e : null)
          ?? errBody
      } catch {
        msg = errBody || `HTTP ${resp.status}`
      }
      throw new Error(msg)
    }
    return resp.json()
  }, [])

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true)
    try {
      const res = await marketFetch('GET', '/api/users')
      setUsers(res.data.items as User[])
    } catch {
      toast.error(t('userManagement.fetchFailed'))
    } finally {
      setUsersLoading(false)
    }
  }, [marketFetch, t])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUsers()
  }, [fetchUsers])

  const handleCreate = useCallback(async () => {
    setCreateError(null)
    if (!createForm.username.trim()) {
      setCreateError(t('userManagement.createModal.usernameRequired'))
      return
    }
    if (!createForm.password.trim()) {
      setCreateError(t('userManagement.createModal.passwordRequired'))
      return
    }

    setCreating(true)
    try {
      await marketFetch('POST', '/api/users', {
        username: createForm.username.trim(),
        password: createForm.password,
        displayName: createForm.displayName.trim() || undefined,
        role: createForm.role
      })
      setShowCreateModal(false)
      setCreateForm({ username: '', displayName: '', password: '', role: 'user' })
      toast.success(t('userManagement.createModal.success'))
      fetchUsers()
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : t('userManagement.createFailed'))
    } finally {
      setCreating(false)
    }
  }, [createForm, marketFetch, fetchUsers, t])

  const handleEdit = useCallback(async () => {
    if (!editTarget) return
    setEditError(null)
    setEditing(true)
    try {
      const body: Record<string, string> = {}
      if (editForm.password) body.password = editForm.password
      if (editForm.displayName !== editTarget.displayName) body.displayName = editForm.displayName
      if (editForm.role !== editTarget.role) body.role = editForm.role
      await marketFetch('PATCH', `/api/users/${editTarget.id}`, body)
      toast.success(t('userManagement.editSuccess') || '用户更新成功')
      setEditTarget(null)
      fetchUsers()
    } catch (e) {
      setEditError(e instanceof Error ? e.message : t('userManagement.editFailed'))
    } finally {
      setEditing(false)
    }
  }, [editTarget, editForm, marketFetch, fetchUsers, t])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await marketFetch('DELETE', `/api/users/${deleteTarget.id}`)
      toast.success(t('userManagement.deleteSuccess'))
      setDeleteTarget(null)
      fetchUsers()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('userManagement.deleteFailed'))
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget, marketFetch, fetchUsers, t])

  const handleRegenerateConfirm = useCallback(async () => {
    if (!regenerateTarget) return
    setRegenerating(true)
    try {
      await marketFetch('POST', `/api/users/${regenerateTarget.id}/regenerate-key`)
      toast.success(t('userManagement.keyRegeneratedSuccess'))
      setRegenerateTarget(null)
      fetchUsers()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('userManagement.regenerateFailed'))
    } finally {
      setRegenerating(false)
    }
  }, [regenerateTarget, marketFetch, fetchUsers, t])

  const handleCopy = useCallback(async (key: string, id: string) => {
    try {
      await navigator.clipboard.writeText(key)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      toast.error(t('common.copyFail'))
    }
  }, [t])

  const toggleReveal = useCallback((id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  /* ═══════════════════════════════════════════
     Logs logic
     ═══════════════════════════════════════════ */

  const fetchLogData = useCallback(async () => {
    setLogsLoading(true)
    try {
      const res = await logApi.query(
        logLevel || undefined,
        logCategory || undefined,
        debouncedLogSearch || undefined,
        logSince || undefined,
        logUntil || undefined,
        logLimit
      )
      setLogData(res)
    } catch {
      setLogData(null)
    } finally {
      setLogsLoading(false)
    }
  }, [logLevel, logCategory, debouncedLogSearch, logSince, logUntil, logLimit])

  const fetchLogCategories = useCallback(async (): Promise<void> => {
    try {
      const cats = await logApi.getCategories()
      setLogCategories(cats)
    } catch {
      // silently ignore
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLogCategories()
  }, [fetchLogCategories])

  useEffect(() => {
    if (activeTab !== 'logs') return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLogData()
  }, [fetchLogData, activeTab])

  const handleLogRefresh = (): void => {
    fetchLogData()
    fetchLogCategories()
  }

  const loadMoreLogs = (): void => {
    setLogLimit((l) => l + INITIAL_LIMIT)
  }

  const handleClearLogs = async (): Promise<void> => {
    setClearingLogs(true)
    try {
      await logApi.deleteLogs()
      setShowClearConfirm(false)
      setLogLimit(INITIAL_LIMIT)
      fetchLogData()
    } catch {
      toast.error(t('common.operationFailed'))
    } finally {
      setClearingLogs(false)
    }
  }

  const handleExportLogs = (): void => {
    if (!logData?.items.length) return
    const exportData = logData.items.map((log) => ({
      timestamp: log.timestamp,
      level: log.level,
      category: log.category,
      message: log.message,
      fields: log.fields
    }))
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `logs_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const formatTime = (ts: string): string => {
    try {
      return new Date(ts).toLocaleString()
    } catch {
      return ts
    }
  }

  /* ═══════════════════════════════════════════
     Access guard
     ═══════════════════════════════════════════ */

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-text-secondary text-sm">{t('auth.noAccess')}</p>
      </div>
    )
  }

  /* ═══════════════════════════════════════════
     Render helpers
     ═══════════════════════════════════════════ */

  const renderReviewTab = (tab: 'scripts' | 'templates') => {
    const items: (RemoteScript | RemoteTemplate)[] = tab === 'scripts' ? scripts : templates
    const isScriptsTab = tab === 'scripts'
    const totalPending = scripts.length + templates.length

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {isScriptsTab ? t('review.scripts') : t('review.templates')}
            </h1>
            <p className="text-text-muted text-sm">
              {t('review.pendingCount', { count: totalPending })}
            </p>
          </div>
          <button
            onClick={fetchPending}
            disabled={reviewLoading}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50"
          >
            {t('common.refresh')}
          </button>
        </div>

        {reviewLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="bg-bg-card rounded-xl border border-border-light p-12 text-center">
            <Clock size={48} className="mx-auto mb-4 text-text-muted" />
            <p className="text-text-muted">{t('review.noPending')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="bg-bg-card rounded-xl border border-border-light p-4"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-medium text-text-primary">{item.name}</h3>
                    <p className="text-xs text-text-muted font-mono mt-1">
                      ID: {item.id} · v{item.version}
                    </p>
                    {item.createdBy && (
                      <p className="text-xs text-text-muted mt-1">
                        {t('review.author')}: {item.createdBy}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isScriptsTab && (
                      <button
                        onClick={() => downloadScript(item as RemoteScript)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border-light text-xs text-text-muted hover:text-primary hover:border-primary transition-colors"
                        title={t('review.downloadToInspect')}
                      >
                        <Download size={14} />
                        {t('review.downloadToInspect')}
                      </button>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded bg-warning/10 text-warning">
                      {t('review.pending')}
                    </span>
                  </div>
                </div>

                {/* Description */}
                {item.description && (
                  <p className="text-sm text-text-secondary mb-3">{item.description}</p>
                )}

                {/* Expandable details */}
                <button
                  onClick={() => toggleExpanded(item.id)}
                  className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary mb-3 transition-colors"
                >
                  {expandedItems.has(item.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  {expandedItems.has(item.id) ? t('review.hideSchema') : t('review.viewSchema')}
                </button>

                {expandedItems.has(item.id) && (
                  <div className="mb-3 pl-2 border-l-2 border-border-light space-y-3">
                    {/* Schema JSON viewer */}
                    <div>
                      <p className="text-xs font-medium text-text-muted mb-1">{t('review.schema')}</p>
                      <pre className="bg-bg-input rounded-lg p-3 text-xs text-text-secondary overflow-x-auto max-h-64 overflow-y-auto font-mono whitespace-pre-wrap">
                        {JSON.stringify(item.schema, null, 2)}
                      </pre>
                    </div>

                    {/* Script-specific fields */}
                    {isScriptsTab && (
                      <>
                        <div>
                          <p className="text-xs font-medium text-text-muted mb-1">{t('review.entryPoint')}</p>
                          <code className="text-xs text-text-secondary bg-bg-input px-2 py-0.5 rounded font-mono">
                            {(item as RemoteScript).entryPoint || '—'}
                          </code>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-text-muted mb-1">{t('review.checksum')}</p>
                          <code className="text-xs text-text-secondary bg-bg-input px-2 py-0.5 rounded font-mono break-all">
                            {(item as RemoteScript).checksum || '—'}
                          </code>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-text-muted mb-1">{t('review.tags')}</p>
                          {(item as RemoteScript).tags && (item as RemoteScript).tags!.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {(item as RemoteScript).tags!.map((tag) => (
                                <span
                                  key={tag}
                                  className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-text-muted">—</span>
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-medium text-text-muted mb-1">{t('review.changelog')}</p>
                          <p className="text-xs text-text-secondary">
                            {(item as RemoteScript).changelog || t('review.noChangelog')}
                          </p>
                        </div>
                      </>
                    )}

                    {/* Template-specific: show type */}
                    {!isScriptsTab && (
                      <div>
                        <p className="text-xs font-medium text-text-muted mb-1">{t('common.type')}</p>
                        <code className="text-xs text-text-secondary bg-bg-input px-2 py-0.5 rounded font-mono">
                          {(item as RemoteTemplate).type || '—'}
                        </code>
                      </div>
                    )}
                  </div>
                )}

                {/* Review comment */}
                <div className="mb-3">
                  <label className="block text-xs text-text-muted mb-1">
                    {t('review.comment')}
                  </label>
                  <textarea
                    value={reviewingId === item.id ? reviewComment : ''}
                    onChange={(e) => {
                      setReviewComment(e.target.value)
                      setReviewingId(item.id)
                    }}
                    placeholder={t('review.commentPlaceholder')}
                    className="w-full px-3 py-2 rounded-lg border border-border-light bg-bg-input text-sm text-text-primary focus:border-primary outline-none resize-none"
                    rows={2}
                  />
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      handleReview(reviewType(), item.id, 'approve')
                    }
                    disabled={reviewingId === item.id}
                    className="flex items-center gap-1 px-4 py-2 rounded-lg bg-success text-white text-sm font-medium hover:bg-success/90 disabled:opacity-50 transition-colors"
                  >
                    <Check size={16} />
                    {t('review.approve')}
                  </button>
                  <button
                    onClick={() =>
                      handleReview(reviewType(), item.id, 'reject')
                    }
                    disabled={reviewingId === item.id}
                    className="flex items-center gap-1 px-4 py-2 rounded-lg bg-danger text-white text-sm font-medium hover:bg-danger/90 disabled:opacity-50 transition-colors"
                  >
                    <X size={16} />
                    {t('review.reject')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const renderUsersTab = () => (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-text-primary">{t('userManagement.title')}</h2>
          <p className="text-text-muted text-sm">{t('userManagement.subtitle')}</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-primary text-white hover:bg-primary-hover"
        >
          <UserPlus size={16} />
          {t('userManagement.createUser')}
        </button>
      </div>

      {/* ── User table ── */}
      <div className="bg-bg-card border border-border-light rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left px-3 py-2 text-text-muted text-xs uppercase border-b border-border-light">
                  {t('userManagement.table.username')}
                </th>
                <th className="text-left px-3 py-2 text-text-muted text-xs uppercase border-b border-border-light">
                  {t('userManagement.table.displayName')}
                </th>
                <th className="text-left px-3 py-2 text-text-muted text-xs uppercase border-b border-border-light">
                  {t('userManagement.table.role')}
                </th>
                <th className="text-left px-3 py-2 text-text-muted text-xs uppercase border-b border-border-light">
                  {t('userManagement.table.apiKey')}
                </th>
                <th className="text-left px-3 py-2 text-text-muted text-xs uppercase border-b border-border-light">
                  {t('userManagement.table.createdAt')}
                </th>
                <th className="text-left px-3 py-2 text-text-muted text-xs uppercase border-b border-border-light">
                  {t('userManagement.table.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {usersLoading ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-text-muted">
                    {t('common.loading')}
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-text-muted">
                    {t('userManagement.noUsers')}
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const isRevealed = revealedIds.has(user.id)
                  const displayKey = isRevealed
                    ? user.apiKey
                    : maskKey(user.apiKey)

                  return (
                    <tr key={user.id} className="hover:bg-bg-tertiary">
                      <td className="px-3 py-2.5">
                        <p className="text-sm font-medium text-text-primary">{user.username}</p>
                        <p className="text-xs text-text-muted font-mono">{user.id}</p>
                      </td>
                      <td className="px-3 py-2.5 text-sm text-text-secondary">
                        {user.displayName || '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${roleBadge[user.role] || ''}`}
                        >
                          {user.role === 'admin'
                            ? t('userManagement.roleAdmin')
                            : user.role === 'developer'
                              ? t('userManagement.roleDeveloper')
                              : t('userManagement.roleUser')}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          <code className="text-xs font-mono text-text-secondary">
                            {displayKey}
                          </code>
                          <button
                            onClick={() => toggleReveal(user.id)}
                            className="p-1 rounded hover:bg-bg-tertiary/50 text-text-muted"
                            title={isRevealed ? 'Hide key' : 'Show full key'}
                          >
                            {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          <button
                            className={`p-1 rounded hover:bg-bg-tertiary/50 ${copiedId === user.id ? 'text-success' : 'text-text-muted'}`}
                            onClick={() => handleCopy(user.apiKey, user.id)}
                          >
                            {copiedId === user.id ? (
                              <Check size={14} />
                            ) : (
                              <Copy size={14} />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-text-muted">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditTarget(user)
                              setEditForm({
                                displayName: user.displayName || '',
                                password: '',
                                role: user.role
                              })
                              setEditError(null)
                            }}
                            className="p-1.5 rounded hover:bg-bg-tertiary/50 text-text-muted"
                            title={t('common.edit')}
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => setRegenerateTarget(user)}
                            className="p-1.5 rounded hover:bg-bg-tertiary/50 text-text-muted"
                            title={t('userManagement.regenerateKey')}
                          >
                            <RotateCcw size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(user)}
                            className="p-1.5 rounded hover:bg-danger-light text-danger"
                            title={t('userManagement.deleteUser')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Create User Modal ── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div
            className="bg-bg-card rounded-xl shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-4">{t('userManagement.createModal.title')}</h2>

            {createError && (
              <div className="mb-3 p-3 rounded-lg bg-danger/10 text-danger text-sm">
                {createError}
              </div>
            )}

            <div className="space-y-3">
              {/* Username */}
              <div>
                <label className="block text-xs text-text-muted mb-1">
                  {t('userManagement.table.username')} *
                </label>
                <input
                  type="text"
                  value={createForm.username}
                  onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
                  placeholder={t('login.usernamePlaceholder')}
                  className="w-full px-3 py-2 rounded-lg border border-border-light bg-bg-input text-sm text-text-primary focus:border-primary outline-none transition-colors"
                />
              </div>
              {/* Display Name */}
              <div>
                <label className="block text-xs text-text-muted mb-1">
                  {t('userManagement.table.displayName')}
                </label>
                <input
                  type="text"
                  value={createForm.displayName}
                  onChange={(e) => setCreateForm((f) => ({ ...f, displayName: e.target.value }))}
                  placeholder={t('login.displayNamePlaceholder')}
                  className="w-full px-3 py-2 rounded-lg border border-border-light bg-bg-input text-sm text-text-primary focus:border-primary outline-none transition-colors"
                />
              </div>
              {/* Password */}
              <div>
                <label className="block text-xs text-text-muted mb-1">
                  {t('login.password')} *
                </label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder={t('login.passwordPlaceholder')}
                  className="w-full px-3 py-2 rounded-lg border border-border-light bg-bg-input text-sm text-text-primary focus:border-primary outline-none transition-colors"
                />
              </div>
              {/* Role */}
              <div>
                <label className="block text-xs text-text-muted mb-1">
                  {t('userManagement.table.role')}
                </label>
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-border-light bg-bg-input text-sm text-text-primary focus:border-primary outline-none appearance-none cursor-pointer transition-colors"
                >
                  <option value="user">{t('userManagement.roleUser')}</option>
                  <option value="developer">{t('userManagement.roleDeveloper')}</option>
                  <option value="admin">{t('userManagement.roleAdmin')}</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setCreateError(null)
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary border border-border-light hover:border-primary transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-primary text-white hover:bg-primary-hover disabled:opacity-50"
              >
                {creating ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    {t('userManagement.createModal.creating')}
                  </>
                ) : (
                  t('common.create')
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit User Modal ── */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div
            className="bg-bg-card rounded-xl shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-4">
              {t('userManagement.editModal.title', { username: editTarget.username })}
            </h2>

            {editError && (
              <div className="mb-3 p-3 rounded-lg bg-danger/10 text-danger text-sm">
                {editError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-text-muted mb-1">
                  {t('userManagement.table.username')}
                </label>
                <input
                  type="text"
                  value={editTarget.username}
                  disabled
                  className="w-full px-3 py-2 rounded-lg border border-border-light bg-bg-input/50 text-sm text-text-muted outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">
                  {t('userManagement.table.displayName')}
                </label>
                <input
                  type="text"
                  value={editForm.displayName}
                  onChange={(e) => setEditForm((f) => ({ ...f, displayName: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-border-light bg-bg-input text-sm text-text-primary focus:border-primary outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">
                  {t('login.password')}
                </label>
                <input
                  type="password"
                  value={editForm.password}
                  onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder={t('userManagement.editModal.passwordPlaceholder') || '留空则不修改密码'}
                  className="w-full px-3 py-2 rounded-lg border border-border-light bg-bg-input text-sm text-text-primary focus:border-primary outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">
                  {t('userManagement.table.role')}
                </label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-border-light bg-bg-input text-sm text-text-primary focus:border-primary outline-none appearance-none cursor-pointer transition-colors"
                >
                  <option value="user">{t('userManagement.roleUser')}</option>
                  <option value="developer">{t('userManagement.roleDeveloper')}</option>
                  <option value="admin">{t('userManagement.roleAdmin')}</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => { setEditTarget(null); setEditError(null) }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary border border-border-light hover:border-primary transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleEdit}
                disabled={editing}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-primary text-white hover:bg-primary-hover disabled:opacity-50"
              >
                {editing ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    {t('common.loading')}
                  </>
                ) : (
                  t('common.save')
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Dialog ── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title={t('common.confirmDelete')}
        message={deleteTarget ? t('userManagement.confirmDelete', { username: deleteTarget.username }) : ''}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        danger
        loading={deleting}
      />

      {/* ── Regenerate Key Confirm Dialog ── */}
      <ConfirmDialog
        open={!!regenerateTarget}
        onClose={() => setRegenerateTarget(null)}
        onConfirm={handleRegenerateConfirm}
        title={t('userManagement.regenerateKey')}
        message={regenerateTarget ? t('userManagement.confirmRegenerateKey', { username: regenerateTarget.username }) : ''}
        confirmText={t('common.confirm')}
        cancelText={t('common.cancel')}
        danger={false}
        loading={regenerating}
      />
    </div>
  )

  const renderLogsTab = () => (
    <div className="space-y-4">
      {/* 页面标题与筛选操作栏 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('logs.title')}</h1>
        <div className="flex items-center gap-3">
          <SearchInput
            value={logSearch}
            onChange={setLogSearch}
            placeholder={t('common.search') + '...'}
            inputClassName="pl-9 pr-3 py-1.5 text-sm border border-border-light rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary w-48"
          />
          {/* 日志级别筛选 */}
          <select
            value={logLevel}
            onChange={(e) => setLogLevel(e.target.value)}
            className="px-3 py-1.5 text-sm border border-border-light rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">{t('logs.level')}</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {t(levelLabelKey[l])}
              </option>
            ))}
          </select>
          {/* 日志分类筛选 */}
          <select
            value={logCategory}
            onChange={(e) => setLogCategory(e.target.value)}
            className="px-3 py-1.5 text-sm border border-border-light rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary max-w-40"
          >
            <option value="">{t('common.type')}</option>
            {logCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {/* 时间范围筛选 */}
          <div className="flex items-center gap-1">
            <Calendar size={14} className="text-text-muted" />
            <input
              type="date"
              value={logSince}
              onChange={(e) => setLogSince(e.target.value)}
              className="px-2 py-1.5 text-sm border border-border-light rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <span className="text-text-muted text-xs">~</span>
            <input
              type="date"
              value={logUntil}
              onChange={(e) => setLogUntil(e.target.value)}
              className="px-2 py-1.5 text-sm border border-border-light rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <button
            onClick={handleExportLogs}
            disabled={!logData?.items.length}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border-light rounded-lg hover:bg-bg-tertiary transition-colors disabled:opacity-40"
          >
            <Download size={16} />
            {t('logs.exportLogs')}
          </button>
          <button
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-danger/30 text-danger rounded-lg hover:bg-danger-light transition-colors"
          >
            <Trash2 size={16} />
            {t('logs.clearLogs')}
          </button>
          <button
            onClick={handleLogRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border-light rounded-lg hover:bg-bg-tertiary transition-colors"
          >
            <RefreshCw size={16} className={logsLoading ? 'animate-spin' : ''} />
            {t('common.refresh')}
          </button>
        </div>
      </div>

      {logsLoading && !logData ? (
        <div className="text-center py-12 text-text-muted">{t('common.loading')}</div>
      ) : !logData?.items.length ? (
        <div className="text-center py-12 text-text-muted">{t('logs.noLogs')}</div>
      ) : (
        <>
          {/* 日志表格 */}
          <div className="overflow-x-auto border border-border-light rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-bg-tertiary">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-text-secondary w-44">
                    {t('logs.timestamp')}
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-text-secondary w-20">
                    {t('logs.level')}
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-text-secondary w-32">
                    {t('common.type')}
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-text-secondary">
                    {t('logs.message')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {logData.items.map((log) => (
                  <tr key={log.id} className="hover:bg-bg-tertiary">
                    <td className="px-4 py-2.5 font-mono text-xs text-text-muted">
                      {formatTime(log.timestamp)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${levelColor[log.level] || levelColor.debug}`}
                      >
                        {t(levelLabelKey[log.level] || log.level)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-text-secondary">{log.category}</td>
                    <td className="px-4 py-2.5 text-xs font-mono break-all max-w-xl">
                      {log.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {logData.items.length < logData.total && (
            <div className="flex justify-center">
              <button
                onClick={loadMoreLogs}
                className="px-4 py-1.5 text-sm border border-border-light rounded-lg hover:bg-bg-tertiary transition-colors"
              >
                {t('logs.loadMore')} ({logData.items.length}/{logData.total})
              </button>
            </div>
          )}
        </>
      )}

      {showClearConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowClearConfirm(false)}
        >
          <div
            className="bg-bg-card rounded-xl shadow-xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-2">{t('logs.clearLogs')}</h2>
            <p className="text-sm text-text-secondary mb-6">{t('logs.confirmClearLogs')}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-1.5 text-sm border border-border-light rounded-lg hover:bg-bg-tertiary"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleClearLogs}
                disabled={clearingLogs}
                className="px-4 py-1.5 text-sm bg-danger text-white rounded-lg hover:bg-danger-hover disabled:opacity-50"
              >
                {clearingLogs ? t('common.loading') : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  /* ═══════════════════════════════════════════
     Main render
     ═══════════════════════════════════════════ */

  return (
    <div className="space-y-6">
      {/* ── Tab bar ── */}
      <div className="flex gap-1 border-b border-border-light pb-0">
        {TAB_ITEMS.map(({ key, icon: Icon, labelKey }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors -mb-[1px] border-b-2 ${
              activeTab === key
                ? 'text-primary border-primary bg-primary/5'
                : 'text-text-muted border-transparent hover:text-text-secondary'
            }`}
          >
            <Icon size={16} />
            {t(labelKey)}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {activeTab === 'scripts' && renderReviewTab('scripts')}
      {activeTab === 'templates' && renderReviewTab('templates')}
      {activeTab === 'users' && renderUsersTab()}
      {activeTab === 'logs' && renderLogsTab()}
    </div>
  )
}

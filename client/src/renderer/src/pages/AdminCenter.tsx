/**
 * @file AdminCenter 鈥?绠＄悊涓績 (瀹℃牳 + 鐢ㄦ埛绠＄悊)
 * @description 绠＄悊鍛樹竴绔欏紡鎺у埗鍙帮細
 *   - Tab 1: 鑴氭湰瀹℃牳
 *   - Tab 2: 妯℃澘瀹℃牳
 *   - Tab 3: 鐢ㄦ埛绠＄悊
 * @module renderer/pages
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Shield,
  Users,
  UserPlus,
  Copy,
  Eye,
  EyeOff,
  RotateCcw,
  Loader2,
  Edit3,
  Trash2
} from 'lucide-react'
import { marketplaceApi, getMarketplaceUrl, getMarketplaceHeaders } from '../api'
import { useAuth } from '../contexts/AuthContext'
import { toast } from '../utils/toast'
import { ConfirmDialog } from '../components/common'
import type { RemoteScript, RemoteTemplate } from '../types'

/* 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?   Tab type
   鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?*/

type AdminTab = 'users'

const TAB_ITEMS: { key: AdminTab; icon: typeof Shield; labelKey: string }[] = [
  { key: 'users', icon: Users, labelKey: 'userManagement.title' }
]

/* 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?   User Management helpers
   鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?*/

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

/* 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?   Component
   鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?*/

export default function AdminCenter() {
  const { t } = useTranslation()
  const { isAdmin } = useAuth()

  /* 鈹€鈹€ Tab 鈹€鈹€ */
  const [activeTab, setActiveTab] = useState<AdminTab>('users')

  /* 鈹€鈹€ Review state (shared between scripts & templates tabs) 鈹€鈹€ */
  const [scripts, setScripts] = useState<RemoteScript[]>([])
  const [templates, setTemplates] = useState<RemoteTemplate[]>([])
  const [reviewLoading, setReviewLoading] = useState(true)
  /** 姣忎釜寰呭鏍搁」鐙珛鐨勮瘎璁鸿緭鍏ユ锛坘ey = item.id锛?*/
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({})
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

  /* 鈹€鈹€ User Management state 鈹€鈹€ */
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

  /* 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?     Review logic
     鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?*/

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
      toast.error(e instanceof Error ? e.message : '鑾峰彇寰呭鏍搁」鐩け璐?)
    } finally {
      setReviewLoading(false)
    }
  }, [])

  const [fetchedPending, setFetchedPending] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!fetchedPending) {
      setFetchedPending(true)
      fetchPending()
    }
  }, [fetchedPending, fetchPending])
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleReview = async (
    type: 'script' | 'template',
    id: string,
    action: 'approve' | 'reject'
  ) => {
    setReviewingId(id)
    const comment = reviewComments[id] ?? ''
    try {
      if (type === 'script') {
        await marketplaceApi.reviewScript(id, action, comment)
      } else {
        await marketplaceApi.reviewTemplate(id, action, comment)
      }
      toast.success(action === 'approve' ? '宸叉壒鍑? : '宸叉嫆缁?)
      // 娓呯悊宸插鏍搁」鐨勮瘎璁鸿緭鍏?      setReviewComments((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      fetchPending()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '瀹℃牳澶辫触')
    } finally {
      setReviewingId(null)
    }
  }

  const downloadScript = async (item: RemoteScript) => {
    try {
      const base = await getMarketplaceUrl()
      const url = `${base}${item.downloadUrl}`
      window.open(url, '_blank')
    } catch {
      toast.error('鑾峰彇涓嬭浇閾炬帴澶辫触')
    }
  }

  /* 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?     User Management logic
     鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?*/

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

  const [fetchedUsers, setFetchedUsers] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!fetchedUsers && activeTab === 'users') {
      setFetchedUsers(true)
      fetchUsers()
    }
  }, [activeTab, fetchedUsers, fetchUsers])
  /* eslint-enable react-hooks/set-state-in-effect */

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
      toast.success(t('userManagement.editSuccess') || '鐢ㄦ埛鏇存柊鎴愬姛')
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

  /* 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?     Access guard
     鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?*/

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-text-secondary text-sm">{t('auth.noAccess')}</p>
      </div>
    )
  }

  /* 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?     Render helpers
     鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?*/


  const renderUsersTab = () => (
    <div>
      {/* 鈹€鈹€ Header 鈹€鈹€ */}
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

      {/* 鈹€鈹€ User table 鈹€鈹€ */}
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
                        {user.displayName || '鈥?}
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
                          {copiedId === user.id ? (
                            <span className="text-xs text-success flex items-center gap-1">
                              <Check size={12} />
                              {t('common.copySuccess')}
                            </span>
                          ) : (
                            <button
                              className="p-1 rounded hover:bg-bg-tertiary/50 text-text-muted"
                              onClick={() => handleCopy(user.apiKey, user.id)}
                            >
                              <Copy size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-sm text-text-secondary">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setEditTarget(user)
                              setEditForm({ displayName: user.displayName, password: '', role: user.role })
                              setEditError(null)
                            }}
                            className="p-1 rounded hover:bg-bg-tertiary/50 text-primary"
                            title={t('common.edit')}
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => setRegenerateTarget(user)}
                            className="p-1 rounded hover:bg-bg-tertiary/50 text-warning"
                            title={t('userManagement.regenerateKey')}
                          >
                            <RotateCcw size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(user)}
                            className="p-1 rounded hover:bg-bg-tertiary/50 text-danger"
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

      {/* 鈹€鈹€ Create User Modal 鈹€鈹€ */}
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

      {/* 鈹€鈹€ Edit User Modal 鈹€鈹€ */}
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
                  placeholder={t('userManagement.editModal.passwordPlaceholder') || '鐣欑┖鍒欎笉淇敼瀵嗙爜'}
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

      {/* 鈹€鈹€ Delete Confirm Dialog 鈹€鈹€ */}
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

      {/* 鈹€鈹€ Regenerate Key Confirm Dialog 鈹€鈹€ */}
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

  /* 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?     Main render
     鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?*/

  return (
    <div className="space-y-6">
      {/* 鈹€鈹€ Tab bar 鈹€鈹€ */}
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

      {/* 鈹€鈹€ Tab content 鈹€鈹€ */}
      {activeTab === 'users' && renderUsersTab()}
    </div>
  )
}

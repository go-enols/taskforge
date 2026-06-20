/**
 * @file AdminCenter — 管理中心 (审核 + 用户管理)
 * @description 管理员一站式控制台：
 *   - Tab 1: 脚本审核
 *   - Tab 2: 模板审核
 *   - Tab 3: 用户管理
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
  Trash2,
  Check
} from 'lucide-react'
import { getMarketplaceUrl, getMarketplaceHeaders } from '../api'
import { useAuth } from '../contexts/AuthContext'
import { toast } from '../utils/toast'
import { ConfirmDialog } from '../components/common'

/* ── Tab type ── */

type AdminTab = 'users'

const TAB_ITEMS: { key: AdminTab; icon: typeof Shield; labelKey: string }[] = [
  { key: 'users', icon: Users, labelKey: 'userManagement.title' }
]

/* ── User Management helpers ── */

interface User {
  id: string
  username: string
  displayName: string
  role: 'admin' | 'developer' | 'user'
  apiKey?: string
  apiKeySet?: boolean
  createdAt: string
  updatedAt: string
}

function maskKey(key: string | undefined): string {
  if (!key) return '—'
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

/* ── Component ── */

export default function AdminCenter() {
  const { t } = useTranslation()
  const { isAdmin } = useAuth()

  /* ── Tab ── */
  const [activeTab, setActiveTab] = useState<AdminTab>('users')

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

/* ── User Management logic ── */

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

/* ── Access guard ── */

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-text-secondary text-sm">{t('auth.noAccess')}</p>
      </div>
    )
  }

/* ── Render helpers ── */


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
                  const hasKey = Boolean(user.apiKey)
                  const displayKey = hasKey
                    ? (isRevealed ? user.apiKey : maskKey(user.apiKey))
                    : '••••••••'

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
                          {hasKey && (
                            <button
                              onClick={() => toggleReveal(user.id)}
                              className="p-1 rounded hover:bg-bg-tertiary/50 text-text-muted"
                              title={isRevealed ? 'Hide key' : 'Show full key'}
                            >
                              {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          )}
                          {copiedId === user.id ? (
                            <span className="text-xs text-success flex items-center gap-1">
                              <Check size={12} />
                              {t('common.copySuccess')}
                            </span>
                          ) : (
                            <button
                              className={`p-1 rounded hover:bg-bg-tertiary/50 text-text-muted ${!hasKey ? 'opacity-30 cursor-not-allowed' : ''}`}
                              onClick={() => hasKey && handleCopy(user.apiKey!, user.id)}
                              disabled={!hasKey}
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

/* ── Main render ── */

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
      {activeTab === 'users' && renderUsersTab()}
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { UserPlus, Copy, Eye, EyeOff, Trash2, RotateCcw, Check, Loader2, Edit3 } from 'lucide-react'
import { toast } from 'sonner'
import { getMarketplaceUrl, getMarketplaceHeaders } from '../api'
import { ConfirmDialog } from '../components/common'
import { useAuth } from '../contexts/AuthContext'

/* ── Types ── */

interface User {
  id: string
  username: string
  displayName: string
  role: 'admin' | 'developer' | 'user'
  apiKey: string
  createdAt: string
  updatedAt: string
}

/* ── Helpers ── */

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

/* ── Component ── */

export default function UserManagement() {
  const { t } = useTranslation()
  const { isAdmin } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Create form
  const [form, setForm] = useState({ username: '', displayName: '', password: '', role: 'user' })
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Edit form
  const [editTarget, setEditTarget] = useState<User | null>(null)
  const [editForm, setEditForm] = useState({ displayName: '', password: '', role: 'user' })
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Confirm dialogs
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [regenerateTarget, setRegenerateTarget] = useState<User | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  // ── Helper to call marketplace API ──
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
        // Server returns error as { error: { message: "...", code: "..." } }
        // Safely extract the inner message string, not the error object itself
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

  // ── Fetch users ──
  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await marketFetch('GET', '/api/users')
      setUsers(res.data.items as User[])
    } catch {
      toast.error(t('userManagement.fetchFailed'))
    } finally {
      setLoading(false)
    }
  }, [marketFetch, t])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUsers()
  }, [fetchUsers])

  // ── Create user ──
  const handleCreate = useCallback(async () => {
    setFormError(null)
    if (!form.username.trim()) {
      setFormError(t('userManagement.createModal.usernameRequired'))
      return
    }
    if (!form.password.trim()) {
      setFormError(t('userManagement.createModal.passwordRequired'))
      return
    }

    setCreating(true)
    try {
      await marketFetch('POST', '/api/users', {
        username: form.username.trim(),
        password: form.password,
        displayName: form.displayName.trim() || undefined,
        role: form.role
      })
      setShowModal(false)
      setForm({ username: '', displayName: '', password: '', role: 'user' })
      toast.success(t('userManagement.createModal.success'))
      fetchUsers()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t('userManagement.createFailed'))
    } finally {
      setCreating(false)
    }
  }, [form, marketFetch, fetchUsers, t])

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

  // ── Delete user ──
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

  // ── Regenerate key ──
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

  // ── Copy key ──
  const handleCopy = useCallback(async (key: string, id: string) => {
    try {
      await navigator.clipboard.writeText(key)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      toast.error(t('common.copyFail'))
    }
  }, [t])

  // ── Toggle reveal ──
  const toggleReveal = useCallback((id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // ── Admin access check ──
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-text-secondary text-sm">{t('auth.noAccess')}</p>
      </div>
    )
  }

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-text-primary">{t('userManagement.title')}</h2>
          <p className="text-text-muted text-sm">{t('userManagement.subtitle')}</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
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
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-12 text-center text-text-muted text-sm">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 size={16} className="animate-spin" />
                      {t('common.loading')}
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-12 text-center text-text-muted text-sm">
                    {t('userManagement.noUsers')}
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const isRevealed = revealedIds.has(user.id)
                  const displayKey = isRevealed ? user.apiKey : maskKey(user.apiKey)
                  return (
                    <tr key={user.id} className="hover:bg-bg-card-hover transition-colors">
                      <td className="px-3 py-3 border-b border-border-light">
                        <span className="font-semibold text-sm text-text-primary">{user.username}</span>
                      </td>
                      <td className="px-3 py-3 border-b border-border-light">
                        <span className="text-sm text-text-secondary">{user.displayName}</span>
                      </td>
                      <td className="px-3 py-3 border-b border-border-light">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            roleBadge[user.role] || 'bg-text-muted/10 text-text-muted'
                          }`}
                        >
                          {user.role === 'admin'
                            ? t('userManagement.roleAdmin')
                            : user.role === 'developer'
                              ? t('userManagement.roleDeveloper')
                              : t('userManagement.roleUser')}
                        </span>
                      </td>
                      <td className="px-3 py-3 border-b border-border-light">
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono text-text-secondary bg-bg-input px-1.5 py-0.5 rounded">
                            {displayKey}
                          </code>
                          <button
                            onClick={() => toggleReveal(user.id)}
                            className="text-text-muted hover:text-text-primary transition-colors shrink-0"
                            title={isRevealed ? 'Hide key' : 'Show full key'}
                          >
                            {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          {copiedId === user.id ? (
                            <span className="text-xs text-success flex items-center gap-1 shrink-0">
                              <Check size={12} />
                              {t('common.copySuccess')}
                            </span>
                          ) : (
                            <button
                              onClick={() => handleCopy(user.apiKey, user.id)}
                              className="text-text-muted hover:text-text-primary transition-colors shrink-0"
                              title="Copy API key"
                            >
                              <Copy size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 border-b border-border-light">
                        <span className="text-sm text-text-secondary">{formatDate(user.createdAt)}</span>
                      </td>
                      <td className="px-3 py-3 border-b border-border-light">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => {
                              setEditTarget(user)
                              setEditForm({ displayName: user.displayName, password: '', role: user.role })
                              setEditError(null)
                            }}
                            className="inline-flex items-center gap-1 text-sm text-primary hover:underline transition-colors"
                            title="Edit user"
                          >
                            <Edit3 size={14} />
                            {t('common.edit')}
                          </button>
                          <button
                            onClick={() => setRegenerateTarget(user)}
                            className="inline-flex items-center gap-1 text-sm text-warning hover:underline transition-colors"
                            title="Regenerate API key"
                          >
                            <RotateCcw size={14} />
                            {t('userManagement.regenerateKey')}
                          </button>
                          <button
                            onClick={() => setDeleteTarget(user)}
                            className="inline-flex items-center gap-1 text-sm text-danger hover:underline transition-colors"
                            title="Delete user"
                          >
                            <Trash2 size={14} />
                            {t('userManagement.deleteUser')}
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
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-bg-card border border-border-light rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-semibold text-text-primary mb-5">{t('userManagement.createModal.title')}</h3>

            {formError && (
              <div className="mb-4 px-4 py-2 rounded-lg text-sm bg-danger-light text-danger border border-danger/30">
                {formError}
              </div>
            )}

            <div className="space-y-4">
              {/* Username */}
              <div>
                <label className="block text-xs text-text-secondary mb-1">
                  {t('userManagement.createModal.username')} <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  placeholder={t('login.usernamePlaceholder')}
                  className="bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm w-full text-text-primary focus:border-primary outline-none transition-colors"
                />
              </div>

              {/* Display Name */}
              <div>
                <label className="block text-xs text-text-secondary mb-1">{t('userManagement.createModal.displayName')}</label>
                <input
                  type="text"
                  value={form.displayName}
                  onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                  placeholder={t('login.displayNamePlaceholder')}
                  className="bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm w-full text-text-primary focus:border-primary outline-none transition-colors"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs text-text-secondary mb-1">
                  {t('userManagement.createModal.password')} <span className="text-danger">*</span>
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder={t('login.passwordPlaceholder')}
                  className="bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm w-full text-text-primary focus:border-primary outline-none transition-colors"
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs text-text-secondary mb-1">{t('userManagement.createModal.role')}</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  className="bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm w-full text-text-primary focus:border-primary outline-none appearance-none cursor-pointer transition-colors"
                >
                  <option value="user">{t('userManagement.roleUser')}</option>
                  <option value="developer">{t('userManagement.roleDeveloper')}</option>
                  <option value="admin">{t('userManagement.roleAdmin')}</option>
                </select>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowModal(false)
                  setForm({ username: '', displayName: '', password: '', role: 'user' })
                  setFormError(null)
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
                  t('userManagement.createModal.create')
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit User Modal ── */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-bg-card border border-border-light rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-semibold text-text-primary mb-5">
              {t('userManagement.editModal.title', { username: editTarget.username }) || `编辑用户 ${editTarget.username}`}
            </h3>

            {editError && (
              <div className="mb-4 px-4 py-2 rounded-lg text-sm bg-danger-light text-danger border border-danger/30">
                {editError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-text-secondary mb-1">
                  {t('userManagement.table.username')}
                </label>
                <input
                  type="text"
                  value={editTarget.username}
                  disabled
                  className="bg-bg-input-disabled border border-border-light rounded-lg px-3 py-2 text-sm w-full text-text-muted cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs text-text-secondary mb-1">{t('userManagement.createModal.displayName')}</label>
                <input
                  type="text"
                  value={editForm.displayName}
                  onChange={(e) => setEditForm((f) => ({ ...f, displayName: e.target.value }))}
                  className="bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm w-full text-text-primary focus:border-primary outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-text-secondary mb-1">{t('userManagement.createModal.password')}</label>
                <input
                  type="password"
                  value={editForm.password}
                  onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder={t('userManagement.editModal.passwordPlaceholder') || '留空则不修改密码'}
                  className="bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm w-full text-text-primary focus:border-primary outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-text-secondary mb-1">{t('userManagement.createModal.role')}</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                  className="bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm w-full text-text-primary focus:border-primary outline-none appearance-none cursor-pointer transition-colors"
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
}

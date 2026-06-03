import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  settingApi,
  appApi,
  captchaKeyApi,
  logApi,
  marketplaceApi,
  shellApi,
  windowApi,
  getMarketplaceUrl
} from '../api'
import { useAuth } from '../contexts/AuthContext'
import type { AppInfo, CaptchaKey, ListResponse } from '../types'
import {
  Save,
  Copy,
  RefreshCw,
  Plus,
  Trash2,
  Edit3,
  Download,
  Check,
  Eye,
  EyeOff,
  FolderOpen,
  RotateCcw,
  X
} from 'lucide-react'
import { toast, toastError } from '../utils/toast'
import ThemeToggle from '../components/ThemeToggle'
import { Modal, ConfirmDialog, StaggeredFadeIn } from '../components/common'
import { getVisibleSections, type SectionId, type UserRole } from './settings-sections'

/* ── Section definitions live in ./settings-sections.ts (separated to keep
 *  this module's exports purely components, so React Fast Refresh is happy). ── */

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const

const roleBadgeClass: Record<string, string> = {
  admin: 'bg-danger/10 text-danger border-danger/30',
  developer: 'bg-primary/10 text-primary border-primary/30',
  user: 'bg-success/10 text-success border-success/30'
}

/* ── Reusable section card ── */

const SectionCard: React.FC<{
  title: string
  subtitle?: string
  icon?: React.ElementType
  tone?: 'personal' | 'computer'
  children: React.ReactNode
  footer?: React.ReactNode
}> = ({ title, subtitle, icon: Icon, tone = 'personal', children, footer }) => (
  <div
    className={`bg-bg-card border rounded-xl ${
      tone === 'computer' ? 'border-primary/20' : 'border-border-light'
    }`}
  >
    <div className="px-5 pt-5 pb-3 border-b border-border-light flex items-center gap-3">
      {Icon && <Icon size={18} className="text-text-muted shrink-0" aria-hidden="true" />}
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
      </div>
    </div>
    <div className="px-5 py-4 space-y-4">{children}</div>
    {footer && (
      <div className="px-5 py-3 border-t border-border-light bg-bg-tertiary/30 rounded-b-xl">
        {footer}
      </div>
    )}
  </div>
)

/* ── Main component (terminal model: single page, all visible sections stacked) ── */

const Settings: React.FC = () => {
  const { t } = useTranslation()
  const { user: marketUser, role, logout } = useAuth()
  const roleKey: UserRole = role ?? 'user'

  const personalSections = getVisibleSections(roleKey).filter((s) => s.scope === 'personal')
  const computerSections = getVisibleSections(roleKey).filter((s) => s.scope === 'computer')

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-8">
      <header className="pt-1">
        <h1 className="text-2xl font-bold text-text-primary">{t('settings.title')}</h1>
      </header>

      <UserContextHeader user={marketUser} role={roleKey} />

      <StaggeredFadeIn className="space-y-4" delayStep={50}>
        {personalSections.map((s) => (
          <SectionCard
            key={s.id}
            title={t(s.labelKey)}
            subtitle={t(s.descriptionKey)}
            icon={s.icon}
            tone="personal"
          >
            <SectionContent id={s.id} marketUser={marketUser} onLogout={logout} />
          </SectionCard>
        ))}
      </StaggeredFadeIn>

      {computerSections.length > 0 && (
        <>
          <DividerLabel label={t('settings.divider.computerOnly')} />
          <StaggeredFadeIn className="space-y-4" delayStep={50}>
            {computerSections.map((s) => (
              <SectionCard
                key={s.id}
                title={t(s.labelKey)}
                subtitle={t(s.descriptionKey)}
                icon={s.icon}
                tone="computer"
              >
                <SectionContent id={s.id} marketUser={marketUser} onLogout={logout} />
              </SectionCard>
            ))}
          </StaggeredFadeIn>
        </>
      )}
    </div>
  )
}

/* ── User context header (top of the page) ── */

const UserContextHeader: React.FC<{
  user: ReturnType<typeof useAuth>['user']
  role: UserRole
}> = ({ user, role }) => {
  const { t } = useTranslation()
  const initial = user?.displayName?.[0]?.toUpperCase() ?? user?.username?.[0]?.toUpperCase() ?? '?'
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-bg-card border border-border-light rounded-xl">
      <div
        className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold shrink-0"
        aria-hidden="true"
      >
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-text-secondary">
          {t('settings.context.loggedInAs')}{' '}
          <span className="font-medium text-text-primary">
            {user?.displayName ?? user?.username ?? '—'}
          </span>
        </div>
        <div className="text-xs text-text-muted mt-0.5">
          {t(`settings.context.role.${role}`)}
        </div>
      </div>
    </div>
  )
}

/* ── Divider label between personal and computer groups ── */

const DividerLabel: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex items-center gap-3 pt-1" role="separator" aria-label={label}>
    <div className="flex-1 h-px bg-border-light" />
    <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
      {label}
    </span>
    <div className="flex-1 h-px bg-border-light" />
  </div>
)

/* ── Dispatch each SectionId to its concrete component ── */

function SectionContent({
  id,
  marketUser,
  onLogout
}: {
  id: SectionId
  marketUser: ReturnType<typeof useAuth>['user']
  onLogout: () => void
}): React.ReactNode {
  switch (id) {
    case 'profile':
      return <ProfileSection />
    case 'appearance':
      return <AppearanceSection />
    case 'taskDefaults':
      return marketUser ? <TaskDefaultsSection /> : null
    case 'marketplace':
      return marketUser ? <MarketplaceSection /> : null
    case 'security':
      return <SecuritySection />
    case 'system':
      return <SystemSection />
    case 'data':
      return <DataSection />
    case 'advanced':
      return <AdvancedSection />
    case 'about':
      return <AboutSection onLogout={onLogout} />
    default:
      return null
  }
}

const ProfileSection: React.FC = () => {
  const { t } = useTranslation()
  const { user: marketUser, refresh } = useAuth()
  const [displayName, setDisplayName] = useState(marketUser?.displayName ?? '')
  const [saving, setSaving] = useState(false)
  const [pwModalOpen, setPwModalOpen] = useState(false)

  useEffect(() => {
    // Sync local form state with the latest marketplace user (e.g. after profile refresh).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDisplayName(marketUser?.displayName ?? '')
  }, [marketUser?.displayName])

  const handleSave = async (): Promise<void> => {
    if (!marketUser) return
    if (displayName === marketUser.displayName) {
      toast.info(t('common.saveSuccess'))
      return
    }
    setSaving(true)
    try {
      await marketplaceApi.updateMe({ displayName })
      await refresh()
      toast.success(t('settings.profile.profileUpdated'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.operationFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (!marketUser) return null

  return (
    <>
      <SectionCard
        title={t('settings.sections.profile')}
        subtitle={t('settings.profile.username')}
      >
        <Field label={t('settings.profile.username')} hint={t('settings.profile.usernameReadonly')}>
          <input
            value={marketUser.username}
            disabled
            className="w-full px-3 py-2 text-sm border border-border-light rounded-lg bg-bg-input-disabled text-text-muted cursor-not-allowed"
          />
        </Field>
        <Field label={t('settings.profile.displayName')}>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t('settings.profile.displayNamePlaceholder')}
            className="w-full px-3 py-2 text-sm border border-border-light rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </Field>
        <Field label={t('settings.profile.role')}>
          <span
            className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full border ${
              roleBadgeClass[marketUser.role] || ''
            }`}
          >
            {t(`roles.${marketUser.role}`)}
          </span>
        </Field>
      </SectionCard>

      <div className="flex justify-end gap-2">
        <button
          onClick={() => setPwModalOpen(true)}
          className="px-4 py-2 text-sm border border-border-light text-text-secondary hover:text-text-primary hover:border-primary rounded-lg transition-colors"
        >
          {t('settings.profile.changePassword')}
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors"
        >
          <Save size={14} />
          {saving ? t('common.loading') : t('settings.profile.saveProfile')}
        </button>
      </div>

      <PasswordChangeModal open={pwModalOpen} onClose={() => setPwModalOpen(false)} />
    </>
  )
}

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({
  label,
  hint,
  children
}) => (
  <div>
    <label className="block text-xs font-medium text-text-secondary mb-1.5">{label}</label>
    {children}
    {hint && <p className="text-xs text-text-muted mt-1">{hint}</p>}
  </div>
)

/* ── Password change modal ── */

const PasswordChangeModal: React.FC<{ open: boolean; onClose: () => void }> = ({
  open,
  onClose
}) => {
  const { t } = useTranslation()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext] = useState(false)

  useEffect(() => {
    if (open) {
      // Reset the password-change form fields whenever the modal transitions to open.
      /* eslint-disable react-hooks/set-state-in-effect */
      setCurrent('')
      setNext('')
      setConfirm('')
      setShowCurrent(false)
      setShowNext(false)
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [open])

  const handleSubmit = async (): Promise<void> => {
    if (!current) {
      toast.error(t('login.requiredPassword'))
      return
    }
    if (next.length < 4) {
      toast.error(t('login.passwordTooShort'))
      return
    }
    if (next !== confirm) {
      toast.error(t('settings.profile.passwordMismatch'))
      return
    }
    setSaving(true)
    try {
      await marketplaceApi.updateMe({ currentPassword: current, newPassword: next })
      toast.success(t('settings.profile.passwordUpdated'))
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.operationFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('settings.profile.changePassword')}>
      <div className="space-y-3">
        <Field label={t('settings.profile.currentPassword')}>
          <div className="relative">
            <input
              type={showCurrent ? 'text' : 'password'}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder={t('settings.profile.currentPasswordPlaceholder')}
              className="w-full px-3 py-2 pr-9 text-sm border border-border-light rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="button"
              onClick={() => setShowCurrent((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
            >
              {showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </Field>
        <Field label={t('settings.profile.newPassword')} hint={t('settings.profile.newPasswordPlaceholder')}>
          <div className="relative">
            <input
              type={showNext ? 'text' : 'password'}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder={t('settings.profile.newPasswordPlaceholder')}
              className="w-full px-3 py-2 pr-9 text-sm border border-border-light rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="button"
              onClick={() => setShowNext((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
            >
              {showNext ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </Field>
        <Field label={t('settings.profile.confirmPassword')}>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={t('settings.profile.confirmPasswordPlaceholder')}
            className="w-full px-3 py-2 text-sm border border-border-light rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2 mt-6">
        <button
          onClick={onClose}
          className="px-4 py-1.5 text-sm border border-border-light rounded-lg hover:bg-bg-card-hover transition-colors"
        >
          {t('common.cancel')}
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="px-4 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors"
        >
          {saving ? t('common.loading') : t('common.save')}
        </button>
      </div>
    </Modal>
  )
}

/* ════════════════════════════════════════════════════════════
   APPEARANCE — all roles
   ════════════════════════════════════════════════════════════ */

const AppearanceSection: React.FC = () => {
  const { t } = useTranslation()
  return (
    <SectionCard title={t('settings.sections.appearance')}>
      <Field label={t('settings.theme')}>
        <div className="w-64">
          <ThemeToggle />
        </div>
      </Field>
    </SectionCard>
  )
}

/* ════════════════════════════════════════════════════════════
   TASK DEFAULTS — developer + user
   ════════════════════════════════════════════════════════════ */

const TaskDefaultsSection: React.FC = () => {
  const { t } = useTranslation()
  const [defaults, setDefaults] = useState({
    sandboxDefault: false,
    threadCount: 1,
    retryCount: 0
  })
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchDefaults = useCallback(async () => {
    try {
      const all = await settingApi.getAll()
      setDefaults({
        sandboxDefault: all['task.sandboxDefault'] === '1',
        threadCount: parseInt(all['task.threadCount'] || '1', 10) || 1,
        retryCount: parseInt(all['task.retryCount'] || '0', 10) || 0
      })
    } catch {
      /* ignore */
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    // fetchDefaults performs the async load and updates defaults/loaded state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDefaults()
  }, [fetchDefaults])

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      await Promise.all([
        settingApi.set('task.sandboxDefault', defaults.sandboxDefault ? '1' : '0'),
        settingApi.set('task.threadCount', String(defaults.threadCount)),
        settingApi.set('task.retryCount', String(defaults.retryCount))
      ])
      toast.success(t('settings.taskDefaults.saved'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.operationFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) {
    return <div className="text-sm text-text-muted">{t('common.loading')}</div>
  }

  return (
    <SectionCard
      title={t('settings.sections.taskDefaults')}
      subtitle={t('settings.taskDefaults.subtitle')}
      footer={
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors"
          >
            <Save size={14} />
            {saving ? t('common.loading') : t('common.save')}
          </button>
        </div>
      }
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-text-primary">{t('settings.taskDefaults.sandboxDefault')}</div>
          <div className="text-xs text-text-muted mt-0.5">{t('settings.taskDefaults.sandboxHint')}</div>
        </div>
        <ToggleSwitch
          checked={defaults.sandboxDefault}
          onChange={(v) => setDefaults((p) => ({ ...p, sandboxDefault: v }))}
        />
      </div>
      <Field label={t('settings.taskDefaults.threadCount')} hint={t('settings.taskDefaults.threadCountHint')}>
        <input
          type="number"
          min={1}
          max={100}
          value={defaults.threadCount}
          onChange={(e) => setDefaults((p) => ({ ...p, threadCount: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
          className="w-32 px-3 py-2 text-sm border border-border-light rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </Field>
      <Field label={t('settings.taskDefaults.retryCount')} hint={t('settings.taskDefaults.retryCountHint')}>
        <input
          type="number"
          min={0}
          max={10}
          value={defaults.retryCount}
          onChange={(e) => setDefaults((p) => ({ ...p, retryCount: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
          className="w-32 px-3 py-2 text-sm border border-border-light rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </Field>
    </SectionCard>
  )
}

const ToggleSwitch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }> = ({
  checked,
  onChange,
  disabled
}) => (
  <button
    type="button"
    onClick={() => !disabled && onChange(!checked)}
    disabled={disabled}
    className={`relative w-10 h-5 rounded-full transition-colors ${
      checked ? 'bg-primary' : 'bg-bg-tertiary'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
  >
    <span
      className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`}
    />
  </button>
)

/* ════════════════════════════════════════════════════════════
   MARKETPLACE — admin + developer
   ════════════════════════════════════════════════════════════ */

interface MarketMe {
  id: string
  username: string
  displayName: string
  role: string
  apiKey: string
}

const MarketplaceSection: React.FC = () => {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [me, setMe] = useState<MarketMe | null>(null)
  const [revealKey, setRevealKey] = useState(false)
  const [savingUrl, setSavingUrl] = useState(false)
  const [testing, setTesting] = useState(false)
  const [regenerateOpen, setRegenerateOpen] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const fetchUrl = useCallback(async () => {
    try {
      setUrl(await getMarketplaceUrl())
    } catch {
      /* ignore */
    }
  }, [])

  const fetchMe = useCallback(async () => {
    try {
      setMe(await marketplaceApi.getMe())
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    // fetchUrl / fetchMe perform async loads and update url/me state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUrl()
    fetchMe()
  }, [fetchUrl, fetchMe])

  const handleSaveUrl = async (): Promise<void> => {
    setSavingUrl(true)
    try {
      await settingApi.set('marketplace_server_url', url)
      toast.success(t('common.saveSuccess'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.operationFailed'))
    } finally {
      setSavingUrl(false)
    }
  }

  const handleTest = async (): Promise<void> => {
    setTesting(true)
    try {
      const r = await marketplaceApi.testConnection(url)
      toast.success(t('settings.marketplaceSettings.connectionOk') + (r.needsSetup ? ' (needs setup)' : ''))
    } catch (e) {
      toast.error(t('settings.marketplaceSettings.connectionFailed', { error: e instanceof Error ? e.message : String(e) }))
    } finally {
      setTesting(false)
    }
  }

  const handleCopyKey = async (): Promise<void> => {
    if (!me) return
    try {
      await navigator.clipboard.writeText(me.apiKey)
      toast.success(t('common.copySuccess'))
    } catch {
      toast.error(t('common.copyFail'))
    }
  }

  const handleRegenerate = async (): Promise<void> => {
    setRegenerating(true)
    try {
      const newMe = await marketplaceApi.regenerateMyKey()
      setMe(newMe)
      toast.success(t('userManagement.keyRegeneratedSuccess'))
      setRegenerateOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.operationFailed'))
    } finally {
      setRegenerating(false)
    }
  }

  const maskedKey = me?.apiKey ? `${me.apiKey.slice(0, 8)}...${me.apiKey.slice(-4)}` : ''

  return (
    <>
      <SectionCard
        title={t('settings.sections.marketplace')}
        subtitle={t('settings.marketplaceSettings.subtitle')}
      >
        <Field label={t('settings.marketplaceSettings.serverUrl')} hint={t('settings.marketplaceSettings.serverUrlHint')}>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://localhost:3400"
              className="flex-1 px-3 py-2 text-sm border border-border-light rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={handleTest}
              disabled={testing}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border-light rounded-lg hover:bg-bg-card-hover disabled:opacity-50 transition-colors"
            >
              {testing ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {t('settings.marketplaceSettings.testConnection')}
            </button>
            <button
              onClick={handleSaveUrl}
              disabled={savingUrl}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors"
            >
              <Save size={14} />
              {t('common.save')}
            </button>
          </div>
        </Field>

        {me && (
          <Field label={t('settings.marketplaceSettings.myApiKey')} hint={t('settings.marketplaceSettings.myApiKeyHint')}>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 text-xs font-mono bg-bg-input border border-border-light rounded-lg text-text-primary">
                {revealKey ? me.apiKey : maskedKey}
              </code>
              <button
                onClick={() => setRevealKey((v) => !v)}
                className="p-2 text-text-muted hover:text-text-primary hover:bg-bg-tertiary rounded-lg transition-colors"
                title={revealKey ? t('wallets.hidePrivateKey') : t('wallets.showPrivateKey')}
              >
                {revealKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button
                onClick={handleCopyKey}
                className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border-light rounded-lg hover:bg-bg-card-hover transition-colors"
              >
                <Copy size={14} />
                {t('settings.marketplaceSettings.copyKey')}
              </button>
              <button
                onClick={() => setRegenerateOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm border border-warning/40 text-warning rounded-lg hover:bg-warning/10 transition-colors"
              >
                <RotateCcw size={14} />
                {t('settings.marketplaceSettings.regenerateKey')}
              </button>
            </div>
          </Field>
        )}
      </SectionCard>

      <ConfirmDialog
        open={regenerateOpen}
        onClose={() => setRegenerateOpen(false)}
        onConfirm={handleRegenerate}
        title={t('settings.marketplaceSettings.regenerateKey')}
        message={t('settings.marketplaceSettings.regenerateConfirm')}
        confirmText={t('common.confirm')}
        cancelText={t('common.cancel')}
        danger
        loading={regenerating}
      />
    </>
  )
}

/* ════════════════════════════════════════════════════════════
   SECURITY — admin only
   ════════════════════════════════════════════════════════════ */

const SecuritySection: React.FC = () => {
  const { t } = useTranslation()
  const [keys, setKeys] = useState<ListResponse<CaptchaKey> | null>(null)
  const [editing, setEditing] = useState<CaptchaKey | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ provider: '', apiKey: '' })
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    try {
      setKeys(await captchaKeyApi.list())
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    // fetch performs the async load of captcha keys and updates local state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetch()
  }, [fetch])

  const openAdd = (): void => {
    setAdding(true)
    setEditing(null)
    setForm({ provider: '', apiKey: '' })
  }

  const openEdit = (item: CaptchaKey): void => {
    setEditing(item)
    setAdding(false)
    setForm({ provider: item.provider, apiKey: item.apiKey })
  }

  const close = (): void => {
    setAdding(false)
    setEditing(null)
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      if (editing) {
        await captchaKeyApi.update(editing.id, form)
      } else {
        await captchaKeyApi.create({ ...form, balance: 0 })
      }
      close()
      await fetch()
      toast.success(t('common.saveSuccess'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.operationFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!deletingId) return
    try {
      await captchaKeyApi.delete(deletingId)
      setDeletingId(null)
      await fetch()
      toast.success(t('common.delete') + ' ' + t('common.success'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.operationFailed'))
    }
  }

  const items = keys?.items ?? []

  return (
    <>
      <SectionCard
        title={t('settings.sections.security')}
        subtitle={t('settings.security.subtitle')}
        footer={
          <div className="flex justify-end">
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
            >
              <Plus size={14} />
              {t('settings.addCaptchaKey')}
            </button>
          </div>
        }
      >
        <p className="text-xs text-text-muted">{t('settings.security.captchaKeysHint')}</p>
        {items.length === 0 ? (
          <div className="text-sm text-text-muted py-4 text-center">{t('settings.noCaptchaKeys')}</div>
        ) : (
          <div className="border border-border-light rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg-tertiary">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-text-muted">{t('settings.provider')}</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-text-muted">{t('settings.apiKey')}</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-text-muted">{t('settings.balance')}</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-text-muted">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light/50">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-bg-card-hover transition-colors">
                    <td className="px-4 py-2.5">{item.provider}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{item.apiKey.slice(0, 8)}...</td>
                    <td className="px-4 py-2.5">{item.balance}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(item)}
                          className="p-1 text-text-muted hover:text-primary hover:bg-primary-light rounded transition-colors"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={() => setDeletingId(item.id)}
                          className="p-1 text-danger hover:bg-danger-light rounded transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <Modal
        open={adding || !!editing}
        onClose={close}
        title={editing ? t('settings.editCaptchaKey') : t('settings.addCaptchaKey')}
      >
        <div className="space-y-3">
          <Field label={t('settings.provider')}>
            <input
              value={form.provider}
              onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
              placeholder="2captcha / anticaptcha / capsolver ..."
              className="w-full px-3 py-2 text-sm border border-border-light rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </Field>
          <Field label={t('settings.apiKey')}>
            <input
              value={form.apiKey}
              onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-border-light rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary font-mono"
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={close}
            className="px-4 py-1.5 text-sm border border-border-light rounded-lg hover:bg-bg-card-hover transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.provider || !form.apiKey}
            className="px-4 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors"
          >
            {saving ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={handleDelete}
        title={t('common.delete')}
        message={t('settings.confirmDeleteCaptchaKey')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        danger
      />
    </>
  )
}

/* ════════════════════════════════════════════════════════════
   SYSTEM — admin only (log level, updates)
   ════════════════════════════════════════════════════════════ */

const SystemSection: React.FC = () => {
  const { t } = useTranslation()
  const [logLevel, setLogLevel] = useState('info')
  const [saving, setSaving] = useState(false)

  // Updates state
  const [updateStatus, setUpdateStatus] = useState<
    'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  >('idle')
  const [updateInfo, setUpdateInfo] = useState<{ version: string } | null>(null)
  const [updateError, setUpdateError] = useState('')
  const [progress, setProgress] = useState({ percent: 0, transferred: 0, total: 0 })

  useEffect(() => {
    logApi
      .getLevel()
      .then(setLogLevel)
      .catch((err: unknown) => {
        toastError(err instanceof Error ? err.message : t('common.error'))
      })
  }, [t])

  useEffect(() => {
    const handler = (...args: unknown[]): void => {
      const p = args[0] as { status: string; data?: unknown }
      setUpdateStatus(p.status as typeof updateStatus)
      if (p.status === 'available') setUpdateInfo(p.data as { version: string })
      if (p.status === 'downloading') setProgress(p.data as typeof progress)
      if (p.status === 'error') setUpdateError(String(p.data ?? ''))
    }
    const unsub = window.electronAPI?.on?.('update:status', handler)
    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [])

  const handleSaveLogLevel = async (): Promise<void> => {
    setSaving(true)
    try {
      await logApi.setLevel(logLevel)
      toast.success(t('settings.logLevelSaved'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.operationFailed'))
    } finally {
      setSaving(false)
    }
  }

  const checkUpdates = async (): Promise<void> => {
    setUpdateStatus('checking')
    setUpdateError('')
    try {
      await window.electronAPI?.invoke?.('update:check')
    } catch {
      setUpdateStatus('error')
      setUpdateError(t('common.error'))
    }
  }

  const downloadUpdate = async (): Promise<void> => {
    setUpdateError('')
    try {
      await window.electronAPI?.invoke?.('update:download')
    } catch {
      setUpdateStatus('error')
      setUpdateError(t('common.error'))
    }
  }

  const installUpdate = async (): Promise<void> => {
    try {
      await window.electronAPI?.invoke?.('update:install')
    } catch (err: unknown) {
      // The app is about to restart; no UI to update. Log for diagnostics.
      console.warn('[settings] update:install failed:', err)
    }
  }

  return (
    <>
      <SectionCard title={t('settings.sections.system')} subtitle={t('settings.system.subtitle')}>
        <Field label={t('settings.system.logLevel')} hint={t('settings.system.logLevelHint')}>
          <div className="flex items-center gap-2">
            <select
              value={logLevel}
              onChange={(e) => setLogLevel(e.target.value)}
              className="w-40 px-3 py-2 text-sm border border-border-light rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {LOG_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {t(`settings.system.logLevels.${l}`)}
                </option>
              ))}
            </select>
            <button
              onClick={handleSaveLogLevel}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors"
            >
              <Save size={14} />
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </Field>

        <div className="pt-2 border-t border-border-light">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-medium text-text-primary">{t('settings.updates')}</h3>
              <p className="text-xs text-text-muted mt-0.5">{t('settings.system.updatesHint')}</p>
            </div>
            <button
              onClick={checkUpdates}
              disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border-light rounded-lg hover:bg-bg-card-hover disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={14} className={updateStatus === 'checking' ? 'animate-spin' : ''} />
              {t('updates.checkNow')}
            </button>
          </div>
          {updateError && (
            <div className="px-3 py-2 text-sm text-danger bg-danger-light rounded-lg">{updateError}</div>
          )}
          {(updateStatus === 'available' || updateStatus === 'downloading') && updateInfo && (
            <div className="px-3 py-3 bg-primary-light border border-primary/30 rounded-lg space-y-2">
              <p className="text-sm text-primary">
                <strong>{t('updates.updateAvailable')}</strong> {t('updates.version')}: <span className="font-mono">{updateInfo.version}</span>
              </p>
              <button
                onClick={downloadUpdate}
                disabled={updateStatus === 'downloading'}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors"
              >
                <Download size={14} />
                {t('updates.downloadUpdate')}
              </button>
              {updateStatus === 'downloading' && progress.total > 0 && (
                <div className="w-full bg-bg-tertiary rounded-full h-2 mt-1">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${progress.percent}%` }}
                  />
                  <p className="text-xs text-primary mt-1">
                    {Math.round(progress.percent)}% — {(progress.transferred / 1024 / 1024).toFixed(1)}MB / {(progress.total / 1024 / 1024).toFixed(1)}MB
                  </p>
                </div>
              )}
            </div>
          )}
          {updateStatus === 'downloaded' && (
            <div className="px-3 py-3 bg-success-light border border-success/30 rounded-lg">
              <p className="text-sm text-success mb-2">{t('updates.updateReady')}</p>
              <button
                onClick={installUpdate}
                className="px-3 py-1.5 text-sm bg-success text-white rounded-lg hover:bg-success-hover transition-colors"
              >
                {t('updates.restartInstall')}
              </button>
            </div>
          )}
          {updateStatus === 'not-available' && (
            <p className="text-sm text-text-muted">{t('updates.noUpdates')}</p>
          )}
        </div>
      </SectionCard>
    </>
  )
}

/* ════════════════════════════════════════════════════════════
   DATA — all roles
   ════════════════════════════════════════════════════════════ */

const DataSection: React.FC = () => {
  const { t } = useTranslation()
  const { isAdmin } = useAuth()
  const [stats, setStats] = useState<{
    walletCount: number
    accountCount: number
    proxyCount: number
    taskCount: number
  } | null>(null)
  const [dataDir, setDataDir] = useState('')
  const [exporting, setExporting] = useState(false)
  const [clearingLogs, setClearingLogs] = useState(false)
  const [clearAllOpen, setClearAllOpen] = useState(false)

  useEffect(() => {
    appApi
      .getInfo()
      .then((info) => {
        setDataDir(info.dataDir)
        setStats({
          walletCount: info.walletCount,
          accountCount: info.accountCount,
          proxyCount: info.proxyCount,
          taskCount: info.taskCount
        })
      })
      .catch((err: unknown) => {
        toastError(err instanceof Error ? err.message : t('common.error'))
      })
  }, [t])

  const handleOpenFolder = async (): Promise<void> => {
    if (!dataDir) return
    const r = await shellApi.openPath(dataDir)
    if (r.success) {
      toast.success(t('settings.aboutSection.openDir'))
    } else {
      // Fallback: copy path to clipboard
      try {
        await navigator.clipboard.writeText(dataDir)
        toast.success(t('common.copySuccess') + ` (${dataDir})`)
      } catch {
        toast.error(r.error || t('common.operationFailed'))
      }
    }
  }

  const handleExport = async (): Promise<void> => {
    setExporting(true)
    try {
      // Use saveFile dialog
      const result = (await window.electronAPI?.invoke?.(
        'dialog:saveFile',
        'airdrop-farm-export.json',
        '{}'
      )) as { canceled: boolean; filePath: string | null } | undefined
      if (result && !result.canceled) {
        toast.success(t('settings.dataSection.exportSuccess'))
      }
    } catch (e) {
      toast.error(t('settings.dataSection.exportFailed', { error: e instanceof Error ? e.message : String(e) }))
    } finally {
      setExporting(false)
    }
  }

  const handleClearLogs = async (): Promise<void> => {
    setClearingLogs(true)
    try {
      await logApi.deleteLogs()
      toast.success(t('common.delete') + ' ' + t('common.success'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.operationFailed'))
    } finally {
      setClearingLogs(false)
    }
  }

  return (
    <SectionCard title={t('settings.sections.data')} subtitle={t('settings.dataSection.subtitle')}>
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatBox label={t('dashboard.stats.wallets')} value={stats.walletCount} />
          <StatBox label={t('dashboard.stats.accounts')} value={stats.accountCount} />
          <StatBox label={t('dashboard.stats.proxies')} value={stats.proxyCount} />
          <StatBox label={t('dashboard.stats.tasks')} value={stats.taskCount} />
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-text-primary">{t('settings.dataSection.export')}</div>
          <div className="text-xs text-text-muted mt-0.5">{t('settings.dataSection.exportHint')}</div>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border-light rounded-lg hover:bg-bg-card-hover disabled:opacity-50 transition-colors"
        >
          <Download size={14} />
          {exporting ? t('common.loading') : t('common.export')}
        </button>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-text-primary">{t('settings.dataSection.clearLogs')}</div>
          <div className="text-xs text-text-muted mt-0.5">{t('settings.dataSection.clearLogsHint')}</div>
        </div>
        <button
          onClick={handleClearLogs}
          disabled={clearingLogs}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-warning/40 text-warning rounded-lg hover:bg-warning/10 disabled:opacity-50 transition-colors"
        >
          <Trash2 size={14} />
          {clearingLogs ? t('common.loading') : t('settings.dataSection.clearLogs')}
        </button>
      </div>

      {isAdmin && (
        <div className="flex items-center justify-between pt-2 border-t border-danger/20">
          <div>
            <div className="text-sm text-danger font-medium">{t('settings.clearAllData')}</div>
            <div className="text-xs text-text-muted mt-0.5">{t('settings.dataSection.clearAllHint')}</div>
          </div>
          <button
            onClick={() => setClearAllOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-danger/40 text-danger rounded-lg hover:bg-danger/10 transition-colors"
          >
            <Trash2 size={14} />
            {t('settings.clearAllData')}
          </button>
        </div>
      )}

      {dataDir && (
        <div className="pt-3 border-t border-border-light">
          <div className="text-xs text-text-muted mb-1">{t('settings.aboutSection.dataDirectoryLabel')}</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-2 py-1 text-xs font-mono bg-bg-input border border-border-light rounded text-text-secondary break-all">
              {dataDir}
            </code>
            <button
              onClick={handleOpenFolder}
              className="p-1.5 text-text-muted hover:text-primary hover:bg-primary-light rounded transition-colors"
              title={t('settings.aboutSection.openDir')}
            >
              <FolderOpen size={14} />
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={clearAllOpen}
        onClose={() => setClearAllOpen(false)}
        onConfirm={() => {
          setClearAllOpen(false)
          toast.info(t('common.none') + ' (TODO)')
        }}
        title={t('settings.clearAllData')}
        message={t('settings.clearAllDataConfirm')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        danger
      />
    </SectionCard>
  )
}

const StatBox: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="px-3 py-2 rounded-lg bg-bg-tertiary border border-border-light">
    <div className="text-xs text-text-muted">{label}</div>
    <div className="text-lg font-semibold text-text-primary mt-0.5">{value}</div>
  </div>
)

/* ════════════════════════════════════════════════════════════
   ADVANCED — admin only (custom KV settings)
   ════════════════════════════════════════════════════════════ */

const AdvancedSection: React.FC = () => {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [edited, setEdited] = useState<Record<string, string>>({})
  const [newKey, setNewKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingKey, setDeletingKey] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    try {
      const all = await settingApi.getAll()
      setSettings(all)
      setEdited(all)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    // fetch performs the async load of advanced settings and updates local state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetch()
  }, [fetch])

  const hasChanges =
    Object.keys(edited).some((k) => edited[k] !== settings[k]) ||
    Object.keys(edited).length !== Object.keys(settings).length

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      await Promise.all(Object.entries(edited).map(([k, v]) => settingApi.set(k, v)))
      setSettings({ ...edited })
      toast.success(t('common.saveSuccess'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.operationFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleAdd = (): void => {
    const k = newKey.trim()
    if (!k) return
    if (edited[k] !== undefined) return
    setEdited((p) => ({ ...p, [k]: '' }))
    setSettings((p) => ({ ...p, [k]: '' }))
    setNewKey('')
  }

  const handleDeleteConfirm = async (): Promise<void> => {
    if (!deletingKey) return
    try {
      await settingApi.delete(deletingKey)
      setEdited((p) => {
        const n = { ...p }
        delete n[deletingKey]
        return n
      })
      setSettings((p) => {
        const n = { ...p }
        delete n[deletingKey]
        return n
      })
      setDeletingKey(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.operationFailed'))
    }
  }

  const handleCopy = async (key: string, value: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 1500)
    } catch {
      toast.error(t('common.copyFail'))
    }
  }

  return (
    <>
      <SectionCard
        title={t('settings.sections.advanced')}
        subtitle={t('settings.advanced.subtitle')}
      >
        <p className="text-xs text-text-muted">{t('settings.advanced.customSettingsHint')}</p>
        {Object.keys(edited).length === 0 ? (
          <div className="text-sm text-text-muted py-3 text-center">{t('settings.advanced.noCustom')}</div>
        ) : (
          <div className="space-y-2">
            {Object.entries(edited).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <code className="w-44 px-2 py-1.5 text-xs font-mono bg-bg-input border border-border-light rounded text-text-muted shrink-0 truncate" title={k}>
                  {k}
                </code>
                <input
                  value={v}
                  onChange={(e) => setEdited((p) => ({ ...p, [k]: e.target.value }))}
                  className="flex-1 px-3 py-1.5 text-sm border border-border-light rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  onClick={() => handleCopy(k, v)}
                  className="p-1.5 text-text-muted hover:text-primary hover:bg-primary-light rounded transition-colors"
                  title={t('common.copySuccess')}
                >
                  {copiedKey === k ? <Check size={14} /> : <Copy size={14} />}
                </button>
                <button
                  onClick={() => setDeletingKey(k)}
                  className="p-1.5 text-danger hover:bg-danger-light rounded transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2 border-t border-border-light">
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder={t('common.newKey') + '...'}
            className="flex-1 px-3 py-1.5 text-sm border border-border-light rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary font-mono"
          />
          <button
            onClick={handleAdd}
            disabled={!newKey.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border-light rounded-lg hover:bg-bg-card-hover disabled:opacity-40 transition-colors"
          >
            <Plus size={14} />
            {t('settings.advanced.addKey')}
          </button>
        </div>
      </SectionCard>

      {hasChanges && (
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors shadow"
          >
            <Save size={14} />
            {saving ? t('common.loading') : t('settings.saveSettings')}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={!!deletingKey}
        onClose={() => setDeletingKey(null)}
        onConfirm={handleDeleteConfirm}
        title={t('common.deleteSetting')}
        message={t('common.confirmDeleteSetting')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        danger
      />
    </>
  )
}

/* ════════════════════════════════════════════════════════════
   ABOUT — all roles
   ════════════════════════════════════════════════════════════ */

const AboutSection: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const { t } = useTranslation()
  const { user: marketUser, role, isAdmin } = useAuth()
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [platform, setPlatform] = useState<string>('—')
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [logoutOpen, setLogoutOpen] = useState(false)

  useEffect(() => {
    appApi
      .getInfo()
      .then(setInfo)
      .catch((err: unknown) => {
        toastError(err instanceof Error ? err.message : t('common.error'))
      })
    windowApi
      .platform()
      .then(setPlatform)
      .catch((err: unknown) => {
        // Platform is purely informational; fall back to a placeholder.
        setPlatform('—')
        toastError(err instanceof Error ? err.message : t('common.error'))
      })
  }, [t])

  const handleCopy = async (text: string, field: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 1500)
    } catch {
      toast.error(t('common.copyFail'))
    }
  }

  return (
    <SectionCard
      title={t('settings.sections.about')}
      subtitle={t('settings.aboutSection.subtitle')}
    >
      <DataRow label={t('settings.aboutSection.version')}>
        <span className="font-mono">{info?.version ?? '—'}</span>
      </DataRow>
      <DataRow label={t('settings.aboutSection.platform')}>
        <span className="font-mono text-xs">{platform}</span>
      </DataRow>
      <DataRow label={t('settings.aboutSection.database')}>
        {info?.dbConnected ? (
          <span className="text-success">{t('settings.aboutSection.dbConnected')}</span>
        ) : (
          <span className="text-danger">
            {info?.dbError
              ? t('settings.aboutSection.dbDisconnected', { error: info.dbError })
              : '—'}
          </span>
        )}
      </DataRow>
      <DataRow label={t('settings.aboutSection.dataDirectoryLabel')}>
        <div className="flex items-center gap-1">
          <code className="text-xs font-mono break-all">{info?.dataDir ?? '—'}</code>
          {info?.dataDir && (
            <>
              <button
                onClick={() => handleCopy(info.dataDir, 'dataDir')}
                className="p-1 text-text-muted hover:text-primary hover:bg-primary-light rounded transition-colors shrink-0"
                title={t('settings.aboutSection.copyPath')}
              >
                {copiedField === 'dataDir' ? <Check size={12} /> : <Copy size={12} />}
              </button>
            </>
          )}
        </div>
      </DataRow>
      {marketUser && (
        <DataRow label={t('settings.profile.role')}>
          <span
            className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full border ${
              roleBadgeClass[marketUser.role] || ''
            }`}
          >
            {t(`roles.${marketUser.role}`)}
          </span>
          <span className="text-xs text-text-muted ml-2">@{marketUser.username}</span>
        </DataRow>
      )}

      <div className="pt-3 mt-2 border-t border-danger/20 flex items-center justify-between">
        <div>
          <div className="text-sm text-danger font-medium">{t('settings.profile.logout')}</div>
          <div className="text-xs text-text-muted mt-0.5">
            {marketUser?.username ?? '—'}
            {role && ` · ${t(`roles.${role}`)}`}
            {isAdmin && ' · ' + t('common.viewAll')}
          </div>
        </div>
        <button
          onClick={() => setLogoutOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-danger/40 text-danger rounded-lg hover:bg-danger/10 transition-colors"
        >
          <X size={14} />
          {t('settings.profile.logout')}
        </button>
      </div>

      <ConfirmDialog
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        onConfirm={() => {
          setLogoutOpen(false)
          onLogout()
        }}
        title={t('settings.profile.logout')}
        message={t('settings.profile.logoutConfirm')}
        confirmText={t('settings.profile.logout')}
        cancelText={t('common.cancel')}
        danger
      />
    </SectionCard>
  )
}

const DataRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="grid grid-cols-[140px_1fr] items-center gap-3 text-sm">
    <span className="text-text-muted">{label}</span>
    <span className="text-text-primary">{children}</span>
  </div>
)

export default Settings

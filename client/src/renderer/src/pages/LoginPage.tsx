/**
 * @file LoginPage — 登录/注册/初始化页面
 * @description 提供管理员初始化（setup）、用户登录和注册功能。
 *              首次启动时自动检测服务端是否需要初始化。
 *              视觉风格：60/40 双栏布局，左侧品牌展示 + 右侧表单卡片，
 *              完全依赖主题 token 适配明暗主题。
 * @module renderer/pages
 */

import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { getMarketplaceUrl, setMarketplaceUrl } from '../api'
import { toast } from '../utils/toast'
import { Server, UserPlus, LogIn, Shield, ShieldCheck } from 'lucide-react'
import TitleBar from '../components/TitleBar'

/** 页面模式：登录 / 注册 / 管理员初始化 */
type Mode = 'login' | 'register' | 'setup'

/**
 * LoginPage — 登录/注册/初始化页面组件
 *
 * 根据服务端 health 检查结果自动切换模式：
 * - needsSetup === true → setup 模式（创建第一个管理员）
 * - 已有用户 → login 模式（默认）
 * 用户也可手动切换到 register 模式注册新账号。
 */
export default function LoginPage(): React.ReactElement {
  const { t } = useTranslation()
  const { login, register, setup } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [serverUrl, setServerUrl] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [serverLoading, setServerLoading] = useState(false)
  const [detecting, setDetecting] = useState(true)
  const [needsSetup, setNeedsSetup] = useState(true)
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  )

  /** 监听主题切换，实时更新 TitleBar 风格 */
  useEffect(() => {
    if (typeof document === 'undefined') return
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'))
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  /** 检查服务端是否需要管理员初始化，自动切换页面模式 */
  const checkSetup = useCallback(async () => {
    setDetecting(true)
    try {
      const url = await getMarketplaceUrl()
      const resp = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(3000) })
      if (resp.ok) {
        const health = await resp.json().catch(() => ({}))
        setNeedsSetup(Boolean(health.needsSetup))
        setMode(health.needsSetup ? 'setup' : 'login')
      }
    } catch {
      setMode('login')
    } finally {
      setDetecting(false)
    }
  }, [])

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    getMarketplaceUrl().then((url) => setServerUrl(url))
    checkSetup()
  }, [checkSetup])
  /* eslint-enable react-hooks/set-state-in-effect */

  /** 保存并测试服务端 URL 连接 */
  const handleSaveUrl = async () => {
    if (!serverUrl.trim()) {
      toast.error(t('login.connectFailed'))
      return
    }
    setServerLoading(true)
    try {
      const resp = await fetch(`${serverUrl.trim()}/api/health`, { signal: AbortSignal.timeout(5000) })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      await setMarketplaceUrl(serverUrl.trim())
      toast.success(t('login.connectSuccess'))
      checkSetup()
    } catch {
      toast.error(t('login.connectFailed'))
    } finally {
      setServerLoading(false)
    }
  }

  /** 提交登录/注册/初始化表单 */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim()) {
      toast.error(t('login.requiredUsername'))
      return
    }
    if (!password) {
      toast.error(t('login.requiredPassword'))
      return
    }
    if ((mode === 'register' || mode === 'setup') && password !== confirmPassword) {
      toast.error(t('login.passwordMismatch'))
      return
    }
    if (mode === 'register' && password.length < 4) {
      toast.error(t('login.passwordTooShort'))
      return
    }
    if (mode === 'setup' && password.length < 6) {
      toast.error(t('login.adminPasswordTooShort'))
      return
    }

    setLoading(true)
    try {
      await setMarketplaceUrl(serverUrl.trim())
      if (mode === 'login') {
        await login(username.trim(), password)
      } else if (mode === 'register') {
        await register(username.trim(), password, displayName.trim() || username.trim())
      } else {
        await setup(username.trim(), password, displayName.trim() || username.trim())
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('login.operationFailed'))
    } finally {
      setLoading(false)
    }
  }

  const modeTitles: Record<Mode, { titleKey: string; icon: React.ReactNode }> = {
    login: { titleKey: 'login.tabLogin', icon: <LogIn className="w-3.5 h-3.5" /> },
    register: { titleKey: 'login.tabRegister', icon: <UserPlus className="w-3.5 h-3.5" /> },
    setup: { titleKey: 'login.tabSetup', icon: <Shield className="w-3.5 h-3.5" /> }
  }

  if (detecting) {
    return (
      <div className="h-screen flex flex-col bg-bg-page">
        <TitleBar dark={isDark} />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-border-light border-t-primary" />
        </div>
      </div>
    )
  }

  const visibleModes: Mode[] = needsSetup
    ? ['setup', 'login', 'register']
    : ['login', 'register']

  return (
    <div className="h-screen flex flex-col bg-bg-page">
      <TitleBar dark={isDark} />

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[3fr_2fr] overflow-hidden">
        {/* LEFT 60% — brand panel (hidden on mobile) */}
        <BrandPanel />

        {/* RIGHT 40% — form card */}
        <div className="flex items-center justify-center p-6 lg:p-8 overflow-y-auto">
          <div className="w-full max-w-sm animate-fade-in motion-reduce:animate-none">
            <FormCard
              mode={mode}
              needsSetup={needsSetup}
              visibleModes={visibleModes}
              modeTitles={modeTitles}
              onModeChange={setMode}
              onSubmit={handleSubmit}
              loading={loading}
              displayName={displayName}
              setDisplayName={setDisplayName}
              username={username}
              setUsername={setUsername}
              password={password}
              setPassword={setPassword}
              confirmPassword={confirmPassword}
              setConfirmPassword={setConfirmPassword}
              serverUrl={serverUrl}
              setServerUrl={setServerUrl}
              serverLoading={serverLoading}
              onSaveUrl={handleSaveUrl}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── BrandPanel — left 60% showcase ─────────────────────────
const BrandPanel: React.FC = () => {
  const { t } = useTranslation()
  return (
    <div className="relative hidden lg:flex flex-col justify-between p-12 xl:p-16 overflow-hidden bg-bg-page">
      {/* Single subtle radial gradient — works in both themes */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_28%_38%,var(--color-primary)/0.10,transparent_55%)]"
      />

      {/* Top: brand mark + wordmark */}
      <div className="relative flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary via-purple-500 to-pink-500 shadow-sm shadow-primary/25 flex items-center justify-center">
          <span className="text-white font-bold text-sm tracking-tight">T</span>
        </div>
        <span className="text-base font-semibold text-text-primary tracking-tight">TaskForge</span>
      </div>

      {/* Middle: hero copy */}
      <div className="relative max-w-lg">
        <h1 className="text-5xl xl:text-6xl font-bold leading-[1.1] tracking-tight text-text-primary">
          自动化脚本，<br />
          <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
            分发即用
          </span>
          。
        </h1>
        <p className="mt-6 text-base text-text-secondary leading-relaxed max-w-md">
          开发者发布脚本，用户从市场一键安装。沙箱执行、安全可控、所见即所得。
        </p>
      </div>

      {/* Bottom: trust line */}
      <div className="relative flex items-center gap-1.5 text-xs text-text-muted">
        <ShieldCheck size={13} className="text-success" />
        <span>{t('login.securedLocally')}</span>
      </div>
    </div>
  )
}

// ─── FormCard — right 40% standard login card ───────────────
interface FormCardProps {
  mode: Mode
  needsSetup: boolean
  visibleModes: Mode[]
  modeTitles: Record<Mode, { titleKey: string; icon: React.ReactNode }>
  onModeChange: (m: Mode) => void
  onSubmit: (e: React.FormEvent) => Promise<void>
  loading: boolean
  displayName: string
  setDisplayName: (v: string) => void
  username: string
  setUsername: (v: string) => void
  password: string
  setPassword: (v: string) => void
  confirmPassword: string
  setConfirmPassword: (v: string) => void
  serverUrl: string
  setServerUrl: (v: string) => void
  serverLoading: boolean
  onSaveUrl: () => Promise<void>
}

const FormCard: React.FC<FormCardProps> = ({
  mode,
  visibleModes,
  modeTitles,
  onModeChange,
  onSubmit,
  loading,
  displayName,
  setDisplayName,
  username,
  setUsername,
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  serverUrl,
  setServerUrl,
  serverLoading,
  onSaveUrl
}) => {
  const { t } = useTranslation()
  return (
    <div className="bg-bg-card rounded-2xl border border-border-light shadow-sm p-6 lg:p-8">
      {/* Mobile brand wordmark (only visible when left panel is hidden) */}
      <div className="lg:hidden flex items-center gap-2 mb-5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary via-purple-500 to-pink-500 shadow-sm shadow-primary/25 flex items-center justify-center">
          <span className="text-white font-bold text-sm">T</span>
        </div>
        <span className="text-sm font-semibold text-text-primary">TaskForge</span>
      </div>

      {/* Mode tabs */}
      <div className="flex bg-bg-tertiary rounded-lg p-1 mb-5 border border-border-light">
        {visibleModes.map((m) => (
          <button
            key={m}
            onClick={() => onModeChange(m)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              mode === m
                ? 'bg-primary text-text-inverse shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {modeTitles[m].icon}
            {t(modeTitles[m].titleKey)}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        {(mode === 'register' || mode === 'setup') && (
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              {t('login.displayName')}
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('login.displayNamePlaceholder')}
              className="w-full px-3 py-2 rounded-lg bg-bg-input border border-border-light text-text-primary placeholder-text-muted text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            {t('login.username')}
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t('login.usernamePlaceholder')}
            autoFocus
            className="w-full px-3 py-2 rounded-lg bg-bg-input border border-border-light text-text-primary placeholder-text-muted text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            {t('login.password')}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'setup' ? t('login.passwordSetupPlaceholder') : t('login.passwordPlaceholder')}
            className="w-full px-3 py-2 rounded-lg bg-bg-input border border-border-light text-text-primary placeholder-text-muted text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
          />
        </div>

        {(mode === 'register' || mode === 'setup') && (
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              {t('login.confirmPassword')}
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('login.confirmPasswordPlaceholder')}
              className="w-full px-3 py-2 rounded-lg bg-bg-input border border-border-light text-text-primary placeholder-text-muted text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            />
          </div>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full py-2 mt-1">
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-text-inverse/30 border-t-text-inverse rounded-full animate-spin" />
              {t('login.processing')}
            </span>
          ) : (
            t(modeTitles[mode].titleKey)
          )}
        </button>
      </form>

      {/* Server URL — small section below the form */}
      <div className="mt-5 pt-5 border-t border-border-light">
        <label className="block text-xs font-medium text-text-secondary mb-1.5">
          {t('login.serverUrl')}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder={t('login.serverUrlPlaceholder')}
            className="flex-1 px-3 py-1.5 rounded-lg bg-bg-input border border-border-light text-text-primary placeholder-text-muted text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
          />
          <button
            type="button"
            onClick={onSaveUrl}
            disabled={serverLoading}
            className="btn-secondary px-3 py-1.5 text-sm"
          >
            <Server className={`w-3.5 h-3.5 ${serverLoading ? 'animate-pulse' : ''}`} />
            {t('login.connect')}
          </button>
        </div>
      </div>
    </div>
  )
}
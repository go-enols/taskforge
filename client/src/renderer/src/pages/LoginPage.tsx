/**
 * @file LoginPage — 登录/注册/初始化页面
 * @description 提供管理员初始化（setup）、用户登录和注册功能。
 *              首次启动时自动检测服务端是否需要初始化。
 *              视觉风格：单列居中布局，使用应用主题 token 保持与主页面风格一致。
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

      <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
        <div className="w-full max-w-sm">
          {/* 品牌标识 + 应用名 */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shadow-sm mb-3">
              <span className="text-text-inverse font-bold text-lg tracking-tight">T</span>
            </div>
            <h1 className="text-xl font-semibold text-text-primary tracking-tight">TaskForge</h1>
            <p className="text-xs text-text-muted mt-1">
              {mode === 'setup' && '首次启动，请创建管理员账号'}
              {mode === 'login' && '欢迎回来'}
              {mode === 'register' && '创建新账号'}
            </p>
          </div>

          {/* 登录卡片：与主应用卡片样式一致 */}
          <div className="bg-bg-card rounded-xl border border-border-light shadow-sm p-6">
            {/* Mode Tabs */}
            <div className="flex bg-bg-tertiary rounded-lg p-1 mb-5 border border-border-light">
              {visibleModes.map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
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

            <form onSubmit={handleSubmit} className="space-y-3">
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
                  placeholder={
                    mode === 'setup' ? t('login.passwordSetupPlaceholder') : t('login.passwordPlaceholder')
                  }
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

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-2 mt-1"
              >
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

            {/* 服务端地址：单独的小区块，提示需要连接 */}
            <div className="mt-4 pt-4 border-t border-border-light">
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
                  onClick={handleSaveUrl}
                  disabled={serverLoading}
                  className="btn-secondary px-3 py-1.5 text-sm"
                >
                  <Server className={`w-3.5 h-3.5 ${serverLoading ? 'animate-pulse' : ''}`} />
                  {t('login.connect')}
                </button>
              </div>
            </div>
          </div>

          {/* 信任徽章 + 版本 */}
          <div className="mt-6 flex flex-col items-center gap-2 text-text-muted">
            <div className="flex items-center gap-1.5 text-[11px]">
              <ShieldCheck size={12} className="text-success" />
              <span>{t('login.securedLocally')}</span>
            </div>
            <p className="text-[10px]">{t('login.version')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

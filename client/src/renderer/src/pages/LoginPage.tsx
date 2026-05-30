import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { getMarketplaceUrl, setMarketplaceUrl } from '../api'
import { toast } from 'sonner'
import { Server, UserPlus, LogIn, Shield } from 'lucide-react'
import TitleBar from '../components/TitleBar'

type Mode = 'login' | 'register' | 'setup'

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

  useEffect(() => {
    getMarketplaceUrl().then((url) => setServerUrl(url))
    checkSetup()
  }, [])

  const checkSetup = async () => {
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
  }

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
    login: { titleKey: 'login.tabLogin', icon: <LogIn className="w-4 h-4" /> },
    register: { titleKey: 'login.tabRegister', icon: <UserPlus className="w-4 h-4" /> },
    setup: { titleKey: 'login.tabSetup', icon: <Shield className="w-4 h-4" /> }
  }

  if (detecting) {
    return (
      <div className="h-screen flex flex-col bg-bg-page">
        <TitleBar />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    )
  }

  const visibleModes: Mode[] = needsSetup
    ? ['setup', 'login', 'register']
    : ['login', 'register']

  return (
    <div className="h-screen flex flex-col bg-bg-page">
      <TitleBar />
      <div className="flex-1 flex items-center justify-center">
      <div className="w-full max-w-md mx-4">
        <div className="bg-bg-card rounded-2xl shadow-xl border border-border-light p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4">
              <svg className="w-7 h-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-text-primary">{t('login.title')}</h1>
          </div>

          {/* Server URL */}
          <div className="mb-6">
            <label className="block text-xs font-medium text-text-muted mb-1.5">{t('login.serverUrl')}</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder={t('login.serverUrlPlaceholder')}
                className="flex-1 px-3 py-2 rounded-lg border border-border-light bg-bg-input text-text-primary text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
              <button
                onClick={handleSaveUrl}
                disabled={serverLoading}
                className="flex items-center gap-1.5 px-3 py-2 bg-bg-tertiary border border-border-light rounded-lg text-text-secondary hover:text-text-primary hover:border-primary/50 transition-all text-sm disabled:opacity-50"
              >
                <Server className={`w-4 h-4 ${serverLoading ? 'animate-pulse' : ''}`} />
                {t('login.connect')}
              </button>
            </div>
          </div>

          {/* Mode Tabs */}
          <div className="flex bg-bg-tertiary rounded-lg p-1 mb-6">
            {visibleModes.map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-colors ${
                  mode === m
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {modeTitles[m].icon}
                {t(modeTitles[m].titleKey)}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {(mode === 'register' || mode === 'setup') && (
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">{t('login.displayName')}</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t('login.displayNamePlaceholder')}
                  className="w-full px-3 py-2.5 rounded-lg border border-border-light bg-bg-input text-text-primary text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">{t('login.username')}</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('login.usernamePlaceholder')}
                autoFocus
                className="w-full px-3 py-2.5 rounded-lg border border-border-light bg-bg-input text-text-primary text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">{t('login.password')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'setup' ? t('login.passwordSetupPlaceholder') : t('login.passwordPlaceholder')}
                className="w-full px-3 py-2.5 rounded-lg border border-border-light bg-bg-input text-text-primary text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
            </div>

            {(mode === 'register' || mode === 'setup') && (
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">{t('login.confirmPassword')}</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('login.confirmPasswordPlaceholder')}
                  className="w-full px-3 py-2.5 rounded-lg border border-border-light bg-bg-input text-text-primary text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-primary hover:bg-primary-hover text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t('login.processing')}
                </span>
              ) : (
                t(modeTitles[mode].titleKey)
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-text-muted text-xs mt-6">{t('login.version')}</p>
      </div>
    </div>
    </div>
  )
}

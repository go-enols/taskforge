/**
 * @file LoginPage — 登录/注册/初始化页面
 * @description 提供管理员初始化（setup）、用户登录和注册功能。
 *              首次启动时自动检测服务端是否需要初始化。
 *              视觉风格：60/40 双栏布局。左侧 teal 色面板带 SVG 插画
 *              （人物推门，门后透出黄色光），右侧 yellow 色面板放置白色登录卡片。
 *              当用户在密码框聚焦时，门会平滑关闭。
 * @module renderer/pages
 */

import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { getMarketplaceUrl, setMarketplaceUrl } from '../api'
import { toast } from '../utils/toast'
import { Server, UserPlus, LogIn, Shield } from 'lucide-react'
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
  /** 门开合状态 — true=开（门半开、人在张望），false=关（人离开、门合上） */
  const [doorOpen, setDoorOpen] = useState(true)

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

  const visibleModes: Mode[] = needsSetup ? ['setup', 'login', 'register'] : ['login', 'register']

  return (
    <div className="h-screen flex flex-col bg-bg-page">
      <TitleBar dark={isDark} />

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[3fr_2fr] overflow-hidden">
        {/* LEFT 60% — teal 面板 + SVG 插画（仅 lg 显示） */}
        <IllustrationPanel doorOpen={doorOpen} />

        {/* RIGHT 40% — yellow 面板 + 白色登录卡片 */}
        <div
          className="flex items-center justify-center p-6 lg:p-8 overflow-y-auto"
          style={{ backgroundColor: '#f5b900' }}
        >
          <div className="w-full max-w-sm">
            <LoginCard
              mode={mode}
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
              onPasswordFocus={() => setDoorOpen(false)}
              onPasswordBlur={() => setDoorOpen(true)}
            />
            {/* 卡片下方：还没有账号提示 */}
            <div className="mt-6 text-center text-sm" style={{ color: '#0d6e6e' }}>
              <span>{t('login.noAccountPrompt')}</span>
              <button
                type="button"
                onClick={() => setMode('register')}
                className="ml-1 font-semibold hover:underline"
                style={{ color: '#0d6e6e' }}
              >
                {t('login.createOne')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// 左侧插画面板 — 纯 SVG 人物推门，门后透出黄色光
// ════════════════════════════════════════════════════════════════════
const IllustrationPanel: React.FC<{ doorOpen: boolean }> = ({ doorOpen }) => {
  return (
    <div
      className="relative hidden lg:block overflow-hidden"
      style={{ backgroundColor: '#0d6e6e' }}
      aria-label="登录插画"
    >
      <svg
        viewBox="0 0 600 600"
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* 门后黄色光晕 */}
          <radialGradient id="doorLight" cx="60%" cy="55%" r="45%">
            <stop offset="0%" stopColor="#fde047" stopOpacity="0.95" />
            <stop offset="40%" stopColor="#fbbf24" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </radialGradient>
          {/* 地板微弱反光 */}
          <linearGradient id="floorGlow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* 黄色光从门缝透出（位于门后方） */}
        <ellipse cx="360" cy="320" rx="200" ry="240" fill="url(#doorLight)" />

        {/* 门框（深青绿） */}
        <rect x="240" y="120" width="240" height="380" fill="#0a4d4d" rx="3" />
        {/* 门框内侧阴影 */}
        <rect x="240" y="120" width="240" height="14" fill="#083838" />

        {/* 门（hinged on left edge，绕左边缘旋转） */}
        <g
          style={{
            transformOrigin: '240px 120px',
            transform: doorOpen ? 'rotate(28deg)' : 'rotate(0deg)',
            transition: 'transform 0.7s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >
          {/* 门板主体（teal-600） */}
          <rect x="240" y="120" width="240" height="380" fill="#0e7c7b" rx="2" />
          {/* 门板装饰线条（4 格经典门样式） */}
          <rect
            x="260"
            y="150"
            width="200"
            height="90"
            fill="none"
            stroke="#0a4d4d"
            strokeWidth="2.5"
            rx="3"
          />
          <rect
            x="260"
            y="260"
            width="200"
            height="90"
            fill="none"
            stroke="#0a4d4d"
            strokeWidth="2.5"
            rx="3"
          />
          <rect
            x="260"
            y="370"
            width="200"
            height="110"
            fill="none"
            stroke="#0a4d4d"
            strokeWidth="2.5"
            rx="3"
          />
          {/* 门把手（金色） */}
          <circle cx="252" cy="310" r="6" fill="#fbbf24" />
          <circle cx="252" cy="310" r="3" fill="#0a4d4d" />
        </g>

        {/* 地板 — 微弱反光 */}
        <rect x="0" y="500" width="600" height="100" fill="url(#floorGlow)" />
        {/* 地板边线 */}
        <line x1="0" y1="500" x2="600" y2="500" stroke="#0a4d4d" strokeWidth="1" opacity="0.5" />

        {/* 人物剪影 — 西装男子，站在门左侧，右手伸向门把手 */}
        <g transform="translate(60, 160)">
          {/* 影子 */}
          <ellipse cx="90" cy="345" rx="60" ry="6" fill="#000000" opacity="0.25" />

          {/* 头部（肤色） */}
          <circle cx="80" cy="50" r="34" fill="#f4c2a1" />
          {/* 头发（深棕） */}
          <path
            d="M 46 50 Q 46 18 80 12 Q 114 18 114 50 L 110 32 Q 80 12 50 32 Z"
            fill="#3d2914"
          />
          {/* 眉毛 */}
          <rect x="64" y="46" width="10" height="2.5" rx="1" fill="#1f1208" />
          <rect x="86" y="46" width="10" height="2.5" rx="1" fill="#1f1208" />
          {/* 眼睛 */}
          <circle cx="69" cy="54" r="1.8" fill="#1f1208" />
          <circle cx="91" cy="54" r="1.8" fill="#1f1208" />
          {/* 嘴（微笑） */}
          <path
            d="M 70 70 Q 80 76 90 70"
            stroke="#7a3b20"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
          {/* 脖子 */}
          <rect x="73" y="80" width="14" height="14" fill="#f4c2a1" />

          {/* 西装外套 */}
          <path
            d="M 35 100 L 80 90 L 125 100 L 140 250 L 20 250 Z"
            fill="#1e293b"
          />
          {/* 内衬（白衬衫） */}
          <path d="M 70 95 L 80 130 L 90 95 Z" fill="#f5f5f5" />
          {/* 领带（黄色） */}
          <path d="M 76 125 L 84 125 L 86 180 L 80 195 L 74 180 Z" fill="#fbbf24" />

          {/* 左手（身体左侧，自然下垂） */}
          <path
            d="M 30 110 L 16 220 L 26 235 L 38 235 L 42 115 Z"
            fill="#1e293b"
          />
          {/* 左手袖口（白） */}
          <rect x="20" y="225" width="14" height="10" fill="#f5f5f5" />
          {/* 左手手指 */}
          <ellipse cx="30" cy="238" rx="6" ry="4" fill="#f4c2a1" />

          {/* 右手（伸向门把手，抬起到胸前） */}
          <path
            d="M 125 105 L 195 175 L 200 195 L 180 210 L 110 135 Z"
            fill="#1e293b"
          />
          {/* 右手袖口（白） */}
          <rect x="187" y="178" width="18" height="14" fill="#f5f5f5" rx="2" />
          {/* 右手手指 */}
          <ellipse cx="200" cy="200" rx="8" ry="5" fill="#f4c2a1" />

          {/* 西装下摆分割线 */}
          <line x1="35" y1="180" x2="125" y2="180" stroke="#0f172a" strokeWidth="1.5" />
          {/* 纽扣（两个） */}
          <circle cx="80" cy="160" r="2.5" fill="#0f172a" />
          <circle cx="80" cy="210" r="2.5" fill="#0f172a" />

          {/* 西裤（深色） */}
          <rect x="38" y="250" width="35" height="100" fill="#0f172a" />
          <rect x="87" y="250" width="35" height="100" fill="#0f172a" />
          {/* 鞋子 */}
          <ellipse cx="55" cy="352" rx="20" ry="6" fill="#000000" />
          <ellipse cx="105" cy="352" rx="20" ry="6" fill="#000000" />
        </g>

        {/* 门后光在地面上的反射（脚下一小片暖光） */}
        <ellipse
          cx="180"
          cy="510"
          rx="80"
          ry="10"
          fill="#fbbf24"
          opacity="0.4"
          style={{
            opacity: doorOpen ? 0.5 : 0.1,
            transition: 'opacity 0.7s ease'
          }}
        />
      </svg>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// 右侧登录卡片 — 白色卡片坐在 yellow 背景上
// ════════════════════════════════════════════════════════════════════
interface LoginCardProps {
  mode: Mode
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
  onPasswordFocus: () => void
  onPasswordBlur: () => void
}

const LoginCard: React.FC<LoginCardProps> = ({
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
  onSaveUrl,
  onPasswordFocus,
  onPasswordBlur
}) => {
  const { t } = useTranslation()
  return (
    <div className="bg-white rounded-2xl shadow-2xl p-7">
      {/* 顶部：左侧标题 + 右侧"需要帮助" */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold text-slate-800 tracking-wide">
          {t('login.alreadyMember')}
        </h2>
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className="text-xs text-slate-500 hover:text-slate-800 transition-colors"
        >
          {t('login.needHelp')}
        </a>
      </div>

      {/* Mode Tabs */}
      <div className="flex bg-slate-100 rounded-lg p-1 mb-5">
        {visibleModes.map((m) => (
          <button
            key={m}
            onClick={() => onModeChange(m)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              mode === m
                ? 'bg-primary text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {modeTitles[m].icon}
            {t(modeTitles[m].titleKey)}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-3.5">
        {(mode === 'register' || mode === 'setup') && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              {t('login.displayName')}
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('login.displayNamePlaceholder')}
              className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-900 placeholder-slate-400 text-sm focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            {t('login.username')}
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t('login.usernamePlaceholder')}
            autoFocus
            className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-900 placeholder-slate-400 text-sm focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            {t('login.password')}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onFocus={onPasswordFocus}
            onBlur={onPasswordBlur}
            placeholder={mode === 'setup' ? t('login.passwordSetupPlaceholder') : t('login.passwordPlaceholder')}
            className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-900 placeholder-slate-400 text-sm focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
          />
        </div>

        {(mode === 'register' || mode === 'setup') && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              {t('login.confirmPassword')}
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('login.confirmPasswordPlaceholder')}
              className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-900 placeholder-slate-400 text-sm focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
            />
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 mt-1 rounded-lg font-semibold text-sm transition-all disabled:opacity-50"
          style={{ backgroundColor: '#0d6e6e', color: '#ffffff' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0a5b5b')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#0d6e6e')}
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

      {/* Server URL — 卡片底部细分隔线 */}
      <div className="mt-5 pt-4 border-t border-slate-100">
        <label className="block text-xs font-medium text-slate-600 mb-1.5">
          {t('login.serverUrl')}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder={t('login.serverUrlPlaceholder')}
            className="flex-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-900 placeholder-slate-400 text-sm focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
          />
          <button
            type="button"
            onClick={onSaveUrl}
            disabled={serverLoading}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition-colors disabled:opacity-50"
          >
            <Server className={`inline w-3.5 h-3.5 mr-1 ${serverLoading ? 'animate-pulse' : ''}`} />
            {t('login.connect')}
          </button>
        </div>
      </div>
    </div>
  )
}

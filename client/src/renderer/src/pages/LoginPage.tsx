/**
 * @file LoginPage — 登录/注册/初始化页面
 * @description 提供管理员初始化（setup）、用户登录和注册功能。
 *              首次启动时自动检测服务端是否需要初始化。
 *              视觉风格：左 60% 为 Apple 风格的产品展示区（滚动触发动画），
 *                       右 40% 为悬浮的磨砂玻璃登录卡片。
 * @module renderer/pages
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { getMarketplaceUrl, setMarketplaceUrl } from '../api'
import { toast } from '../utils/toast'
import {
  Server,
  UserPlus,
  LogIn,
  Shield,
  Sparkles,
  Store,
  ShieldCheck,
  Database,
  Clock,
  Users,
  FolderKanban,
  ArrowDown
} from 'lucide-react'
import TitleBar from '../components/TitleBar'

/** 页面模式：登录 / 注册 / 管理员初始化 */
type Mode = 'login' | 'register' | 'setup'

/** IntersectionObserver hook：元素进入视口时触发 */
function useInView<T extends HTMLElement>(options: IntersectionObserverInit = {}) {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          obs.unobserve(entry.target)
        }
      },
      { threshold: 0.15, ...options }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return { ref, inView }
}

/** 单个特性卡片 — 滚动进入时淡入上滑 */
const FeatureCard: React.FC<{
  icon: React.ReactNode
  title: string
  desc: string
  delay?: number
}> = ({ icon, title, desc, delay = 0 }) => {
  const { ref, inView } = useInView<HTMLDivElement>()
  return (
    <div
      ref={ref}
      style={{
        transitionDelay: inView ? `${delay}ms` : '0ms',
        transform: inView ? 'translateY(0)' : 'translateY(40px)',
        opacity: inView ? 1 : 0
      }}
      className="transition-all duration-700 ease-out bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:bg-white/10 hover:border-white/20 hover:-translate-y-1"
    >
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-primary mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-white/60 leading-relaxed">{desc}</p>
    </div>
  )
}

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

  /** Hero 区域进入动画（页面加载即触发） */
  const heroIn = useInView<HTMLDivElement>()

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

  /** 三种模式的标签页标题与图标映射 */
  const modeTitles: Record<Mode, { titleKey: string; icon: React.ReactNode }> = useMemo(
    () => ({
      login: { titleKey: 'login.tabLogin', icon: <LogIn className="w-3.5 h-3.5" /> },
      register: { titleKey: 'login.tabRegister', icon: <UserPlus className="w-3.5 h-3.5" /> },
      setup: { titleKey: 'login.tabSetup', icon: <Shield className="w-3.5 h-3.5" /> }
    }),
    []
  )

  /** 营销区特性列表 */
  const features = useMemo(
    () => [
      {
        icon: <Store size={22} />,
        titleKey: 'login.feature1Title',
        descKey: 'login.feature1Desc'
      },
      {
        icon: <ShieldCheck size={22} />,
        titleKey: 'login.feature2Title',
        descKey: 'login.feature2Desc'
      },
      {
        icon: <Database size={22} />,
        titleKey: 'login.feature3Title',
        descKey: 'login.feature3Desc'
      },
      {
        icon: <Clock size={22} />,
        titleKey: 'login.feature4Title',
        descKey: 'login.feature4Desc'
      },
      {
        icon: <Users size={22} />,
        titleKey: 'login.feature5Title',
        descKey: 'login.feature5Desc'
      },
      {
        icon: <FolderKanban size={22} />,
        titleKey: 'login.feature6Title',
        descKey: 'login.feature6Desc'
      }
    ],
    []
  )

  if (detecting) {
    return (
      <div className="h-screen flex flex-col bg-[#0a0a0f]">
        <TitleBar />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-primary" />
        </div>
      </div>
    )
  }

  const visibleModes: Mode[] = needsSetup
    ? ['setup', 'login', 'register']
    : ['login', 'register']

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0f] overflow-hidden">
      <TitleBar />

      <div className="flex-1 flex overflow-hidden">
        {/* ════════════════════════════════════════════
            左侧：营销展示区（60% 宽，Apple 风格滚动动画）
            ════════════════════════════════════════════ */}
        <div className="hidden lg:flex lg:w-[60%] relative overflow-y-auto overflow-x-hidden">
          {/* 背景：深色渐变 + 柔光 */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#0f0f1a] to-[#0a0a0f] pointer-events-none" />
          <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-primary/20 blur-3xl pointer-events-none" />
          <div className="absolute top-1/3 -right-40 w-[500px] h-[500px] rounded-full bg-purple-500/10 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 w-[400px] h-[400px] rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col min-h-full px-16 xl:px-24 py-12">
            {/* Hero */}
            <div
              ref={heroIn.ref}
              style={{
                transform: heroIn.inView ? 'translateY(0)' : 'translateY(30px)',
                opacity: heroIn.inView ? 1 : 0
              }}
              className="transition-all duration-1000 ease-out pt-8"
            >
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-white/70 mb-6">
                <Sparkles size={12} className="text-primary" />
                {t('login.heroEyebrow')}
              </div>
              <h1 className="text-5xl xl:text-6xl font-bold text-white leading-[1.1] tracking-tight mb-6">
                {t('login.heroTitle')}
              </h1>
              <p className="text-lg text-white/60 leading-relaxed max-w-xl mb-8">
                {t('login.heroSubtitle')}
              </p>
              <div className="flex items-center gap-2 text-white/40 text-sm">
                <ArrowDown size={14} className="animate-bounce" />
                <span>向下滚动</span>
              </div>
            </div>

            {/* 特性卡片网格 */}
            <div className="mt-16 grid grid-cols-2 gap-4">
              {features.map((f, i) => (
                <FeatureCard
                  key={f.titleKey}
                  icon={f.icon}
                  title={t(f.titleKey)}
                  desc={t(f.descKey)}
                  delay={i * 80}
                />
              ))}
            </div>

            {/* 底部标语 */}
            <div className="mt-auto pt-16">
              <p className="text-sm text-white/30 tracking-widest uppercase">
                {t('login.bottomTagline')}
              </p>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════
            右侧：悬浮登录卡片（40% 宽，磨砂玻璃）
            ════════════════════════════════════════════ */}
        <div className="w-full lg:w-[40%] relative flex items-center justify-center p-6 lg:p-10 bg-[#0a0a0f] lg:bg-transparent">
          {/* 移动端背景渐变（因为左侧 lg 才显示） */}
          <div className="absolute inset-0 lg:hidden bg-gradient-to-br from-[#0a0a0f] via-[#0f0f1a] to-[#0a0a0f] pointer-events-none" />
          <div className="absolute inset-0 lg:hidden">
            <div className="absolute -top-40 -left-40 w-[400px] h-[400px] rounded-full bg-primary/20 blur-3xl" />
          </div>

          <div className="relative w-full max-w-md">
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl p-8 lg:p-10">
              {/* 移动端才显示的品牌名 */}
              <div className="lg:hidden text-center mb-6">
                <h1 className="text-2xl font-bold text-white">TaskForge</h1>
              </div>

              {/* Tab + 表单头部 */}
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-white mb-1">
                  {t(modeTitles[mode].titleKey)}
                </h2>
                <p className="text-sm text-white/50">
                  {mode === 'setup' && '首次启动，请创建管理员账号'}
                  {mode === 'login' && '欢迎回来，请输入凭据登录'}
                  {mode === 'register' && '创建新账号加入 TaskForge'}
                </p>
              </div>

              {/* Server URL */}
              <div className="mb-5">
                <label className="block text-xs font-medium text-white/60 mb-1.5">
                  {t('login.serverUrl')}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    placeholder={t('login.serverUrlPlaceholder')}
                    className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-colors"
                  />
                  <button
                    onClick={handleSaveUrl}
                    disabled={serverLoading}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white/80 hover:bg-white/10 hover:border-white/20 transition-all text-sm disabled:opacity-50"
                  >
                    <Server className={`w-3.5 h-3.5 ${serverLoading ? 'animate-pulse' : ''}`} />
                    {t('login.connect')}
                  </button>
                </div>
              </div>

              {/* Mode Tabs */}
              <div className="flex bg-black/30 rounded-lg p-1 mb-6">
                {visibleModes.map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                      mode === m
                        ? 'bg-primary text-white shadow-sm'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    {modeTitles[m].icon}
                    {t(modeTitles[m].titleKey)}
                  </button>
                ))}
              </div>

              {/* 登录/注册/初始化表单 */}
              <form onSubmit={handleSubmit} className="space-y-3.5">
                {(mode === 'register' || mode === 'setup') && (
                  <div>
                    <label className="block text-xs font-medium text-white/60 mb-1">
                      {t('login.displayName')}
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={t('login.displayNamePlaceholder')}
                      className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-colors"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1">
                    {t('login.username')}
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t('login.usernamePlaceholder')}
                    autoFocus
                    className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1">
                    {t('login.password')}
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'setup' ? t('login.passwordSetupPlaceholder') : t('login.passwordPlaceholder')}
                    className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-colors"
                  />
                </div>

                {(mode === 'register' || mode === 'setup') && (
                  <div>
                    <label className="block text-xs font-medium text-white/60 mb-1">
                      {t('login.confirmPassword')}
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={t('login.confirmPasswordPlaceholder')}
                      className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-colors"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-primary hover:bg-primary-hover text-white font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-lg shadow-primary/20"
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

            <p className="text-center text-white/30 text-xs mt-4">{t('login.version')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

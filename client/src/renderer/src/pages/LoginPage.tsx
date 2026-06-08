/**
 * @file LoginPage — 登录/注册/初始化页面
 * @description 提供管理员初始化（setup）、用户登录和注册功能。
 *              首次启动时自动检测服务端是否需要初始化。
 *              视觉风格：左 60% 为 Apple 风格的产品展示区（滚动触发动画 + 终端代码演示），
 *                       右 40% 为悬浮的磨砂玻璃登录卡片（带品牌标识）。
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
  Terminal,
  Activity
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

/** 终端演示行 — 字符级高亮与类型色 */
type TerminalLine = {
  text: string
  /** 文本分段：用于高亮不同部分 */
  parts: { text: string; color: string }[]
  /** 该行前面的前缀符号颜色（✓/→/$） */
  prefix?: { symbol: string; color: string }
}

/** 终端代码演示 — TaskForge 真实输出风格 */
const TERMINAL_LINES: TerminalLine[] = [
  {
    text: '$ taskforge run my-script',
    parts: [{ text: '$ taskforge run my-script', color: 'text-slate-100' }]
  },
  {
    text: 'Loading script: my-script v1.0.0',
    prefix: { symbol: '✓', color: 'text-emerald-400' },
    parts: [
      { text: 'Loading script: ', color: 'text-slate-300' },
      { text: 'my-script', color: 'text-cyan-300' },
      { text: ' ', color: 'text-slate-300' },
      { text: 'v1.0.0', color: 'text-amber-300' }
    ]
  },
  {
    text: 'Injecting 12 script params',
    prefix: { symbol: '✓', color: 'text-emerald-400' },
    parts: [
      { text: 'Injecting ', color: 'text-slate-300' },
      { text: '12', color: 'text-pink-300' },
      { text: ' script params', color: 'text-slate-300' }
    ]
  },
  {
    text: 'Running in sandbox mode',
    prefix: { symbol: '→', color: 'text-primary' },
    parts: [
      { text: 'Running in ', color: 'text-slate-300' },
      { text: 'sandbox', color: 'text-purple-300' },
      { text: ' mode', color: 'text-slate-300' }
    ]
  },
  {
    text: 'Completed in 2.3s',
    prefix: { symbol: '✓', color: 'text-emerald-400' },
    parts: [
      { text: 'Completed in ', color: 'text-slate-300' },
      { text: '2.3s', color: 'text-emerald-300' }
    ]
  }
]

/** 终端卡片 — 逐行打字进入视口，结束后光标闪烁 */
const TerminalPreview: React.FC = () => {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.3 })
  const [visibleCount, setVisibleCount] = useState(0)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!inView) {
      setVisibleCount(0)
      setDone(false)
      return
    }
    let cancelled = false
    const timers: ReturnType<typeof setTimeout>[] = []
    TERMINAL_LINES.forEach((_, i) => {
      timers.push(
        setTimeout(() => {
          if (cancelled) return
          setVisibleCount(i + 1)
          if (i === TERMINAL_LINES.length - 1) {
            setTimeout(() => {
              if (!cancelled) setDone(true)
            }, 400)
          }
        }, i * 600)
      )
    })
    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
  }, [inView])

  return (
    <div
      ref={ref}
      className="relative rounded-2xl overflow-hidden shadow-2xl shadow-primary/10 ring-1 ring-white/10"
    >
      {/* 终端窗口：标题栏（终端始终深色为 UX 约定，但边框跟随主题） */}
      <div className="flex items-center gap-2 px-4 py-3 bg-slate-900/90 border-b border-border-light">
        <span className="w-3 h-3 rounded-full bg-red-400/80" />
        <span className="w-3 h-3 rounded-full bg-amber-400/80" />
        <span className="w-3 h-3 rounded-full bg-emerald-400/80" />
        <div className="ml-3 flex items-center gap-1.5 text-xs text-slate-400 font-mono">
          <Terminal size={12} />
          <span>taskforge · ~/projects</span>
        </div>
        <div className="ml-auto flex items-center gap-1 text-[10px] text-slate-500 font-mono">
          <Activity size={10} className="text-emerald-400" />
          <span>live</span>
        </div>
      </div>

      {/* 终端主体：深色 + 扫描线 + 输出 */}
      <div className="relative bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-5 py-5 font-mono text-[13px] leading-6 min-h-[220px]">
        {/* 扫描线装饰 */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, rgba(255,255,255,0.5) 0px, rgba(255,255,255,0.5) 1px, transparent 1px, transparent 3px)'
          }}
        />
        {/* 顶部高光 */}
        <div className="pointer-events-none absolute -top-px left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

        <div className="relative space-y-1">
          {TERMINAL_LINES.map((line, i) => {
            const visible = i < visibleCount
            return (
              <div
                key={i}
                style={{
                  opacity: visible ? 1 : 0,
                  transform: visible ? 'translateY(0)' : 'translateY(8px)',
                  transitionDelay: visible ? '0ms' : '0ms'
                }}
                className="transition-all duration-400 ease-out flex items-start gap-2"
              >
                {line.prefix && (
                  <span className={`${line.prefix.color} font-bold select-none`}>
                    {line.prefix.symbol}
                  </span>
                )}
                <span className="flex-1 break-all">
                  {line.parts.map((p, j) => (
                    <span key={j} className={p.color}>
                      {p.text}
                    </span>
                  ))}
                </span>
              </div>
            )
          })}

          {/* 闪烁光标 */}
          <div
            style={{
              opacity: visibleCount >= TERMINAL_LINES.length ? 1 : 0,
              transition: 'opacity 300ms ease-out'
            }}
            className="flex items-center gap-1 pt-1"
          >
            <span
              className={`inline-block w-2 h-4 bg-primary ${
                done ? 'animate-pulse' : 'animate-pulse'
              }`}
            />
            <span className="text-slate-500 text-xs">ready</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** 单个特性卡片 — 滚动进入时淡入上滑，带渐变描边和图标渐变 */
const FeatureCard: React.FC<{
  icon: React.ReactNode
  title: string
  desc: string
  delay?: number
  gradient: string
  compact?: boolean
}> = ({ icon, title, desc, delay = 0, gradient, compact = false }) => {
  const { ref, inView } = useInView<HTMLDivElement>()
  return (
    <div
      ref={ref}
      style={{
        transitionDelay: inView ? `${delay}ms` : '0ms',
        transform: inView ? 'translateY(0) scale(1)' : 'translateY(40px) scale(0.98)',
        opacity: inView ? 1 : 0
      }}
      className="transition-all duration-700 ease-out group p-[1px] rounded-2xl bg-gradient-to-br from-primary/30 via-primary/10 to-purple-500/20 hover:from-primary/50 hover:to-purple-500/30 hover:scale-[1.02] hover:shadow-2xl hover:shadow-primary/10"
    >
      <div
        className={`bg-bg-card backdrop-blur-sm rounded-2xl h-full border border-border-light group-hover:border-border-hover transition-colors ${
          compact ? 'p-3.5' : 'p-6'
        }`}
      >
        <div className={`flex items-start gap-2.5 ${compact ? 'mb-1.5' : 'mb-4'}`}>
          <div
            className={`${compact ? 'w-8 h-8' : 'w-11 h-11'} shrink-0 rounded-xl ${gradient} flex items-center justify-center text-white shadow-lg ring-1 ring-white/10 ${
              compact ? '[&>svg]:w-4 [&>svg]:h-4' : ''
            }`}
          >
            {icon}
          </div>
          <h3
            className={`font-semibold text-text-primary tracking-tight leading-tight ${
              compact ? 'text-[13px] pt-1' : 'text-lg mb-2'
            }`}
          >
            {title}
          </h3>
        </div>
        <p
          className={`text-text-secondary leading-relaxed ${
            compact ? 'text-[11px] leading-[1.5] line-clamp-2' : 'text-sm'
          }`}
        >
          {desc}
        </p>
      </div>
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

  /**
   * 监听 html.dark 类，动态同步到 isDark。
   * TitleBar 的 dark prop 仅在主题为深色时启用（浅色主题使用普通样式）。
   * MutationObserver 监听 class 变化，主题切换时自动重渲染。
   */
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof document === 'undefined') return false
    return document.documentElement.classList.contains('dark')
  })
  useEffect(() => {
    if (typeof document === 'undefined') return
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'))
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

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

  /** 营销区特性列表 — 每个图标独立渐变 */
  const features = useMemo(
    () => [
      {
        icon: <Store size={22} />,
        titleKey: 'login.feature1Title',
        descKey: 'login.feature1Desc',
        gradient: 'bg-gradient-to-br from-blue-500 to-cyan-500'
      },
      {
        icon: <ShieldCheck size={22} />,
        titleKey: 'login.feature2Title',
        descKey: 'login.feature2Desc',
        gradient: 'bg-gradient-to-br from-purple-500 to-pink-500'
      },
      {
        icon: <Database size={22} />,
        titleKey: 'login.feature3Title',
        descKey: 'login.feature3Desc',
        gradient: 'bg-gradient-to-br from-amber-500 to-orange-500'
      },
      {
        icon: <Clock size={22} />,
        titleKey: 'login.feature4Title',
        descKey: 'login.feature4Desc',
        gradient: 'bg-gradient-to-br from-emerald-500 to-teal-500'
      },
      {
        icon: <Users size={22} />,
        titleKey: 'login.feature5Title',
        descKey: 'login.feature5Desc',
        gradient: 'bg-gradient-to-br from-pink-500 to-rose-500'
      },
      {
        icon: <FolderKanban size={22} />,
        titleKey: 'login.feature6Title',
        descKey: 'login.feature6Desc',
        gradient: 'bg-gradient-to-br from-indigo-500 to-purple-500'
      }
    ],
    []
  )

  if (detecting) {
    return (
      <div className="h-screen flex flex-col bg-bg-page">
        <TitleBar dark={isDark} />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-border-light border-t-primary" />
        </div>
      </div>
    )
  }

  const visibleModes: Mode[] = needsSetup
    ? ['setup', 'login', 'register']
    : ['login', 'register']

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-bg-page relative">
      <TitleBar dark={isDark} />

      {/* 页面级统一背景：让左右无缝衔接 — 使用主题色变量，浅色/深色均自适应 */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,var(--color-primary)/0.08,transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,var(--color-purple)/0.06,transparent_60%)]" />
      </div>
      {/* 细网格 — 整页统一 */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(ellipse at center, black 20%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 20%, transparent 80%)'
        }}
      />
      {/* 噪点叠加 — 整页统一 */}
      <div
        className="absolute inset-0 opacity-[0.02] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.5'/></svg>\")"
        }}
      />

      <div className="flex-1 flex overflow-hidden relative z-10">
        {/* ════════════════════════════════════════════
            左侧：营销展示区（60% 宽，Apple 风格 — 单屏无滚动）
            ════════════════════════════════════════════ */}
        <div className="hidden lg:flex lg:w-[60%] relative overflow-hidden">
          {/* 背景已移至页面级（左/右共享同一渐变） */}

{/* ── 动画 mesh gradient：2 个慢速漂浮的彩色光球（浅深色均自适应） ── */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div
              className="absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full bg-primary/10 blur-3xl"
              style={{ animation: 'float-1 12s ease-in-out infinite' }}
            />
            <div
              className="absolute -bottom-20 -right-32 w-[380px] h-[380px] rounded-full bg-purple-500/8 blur-3xl"
              style={{ animation: 'float-2 14s ease-in-out infinite' }}
            />
          </div>

          {/* ── 局部 keyframes（注入到 stylesheet，避免全局污染） ── */}
          <style>{`
            @keyframes float-1 {
              0%, 100% { transform: translate(0, 0) scale(1); }
              50% { transform: translate(60px, 40px) scale(1.1); }
            }
            @keyframes float-2 {
              0%, 100% { transform: translate(0, 0) scale(1); }
              50% { transform: translate(-50px, 60px) scale(1.15); }
            }
            @keyframes gradient-shift {
              0%, 100% { background-position: 0% 50%; }
              50% { background-position: 100% 50%; }
            }
          `}</style>

          <div className="relative z-10 flex flex-col h-full w-full px-12 xl:px-16 py-8">
            {/* 顶部品牌栏 */}
            <div className="flex items-center gap-2.5 mb-6">
              <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-primary via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-primary/30 ring-1 ring-white/20">
                <span className="text-white font-bold text-base tracking-tight">T</span>
                <div className="absolute inset-0 rounded-xl bg-gradient-to-tr from-white/0 via-white/10 to-white/0 opacity-50" />
              </div>
              <div>
                <div className="text-text-primary font-semibold text-sm tracking-tight">TaskForge</div>
                <div className="text-text-muted text-[10px] tracking-widest uppercase">Forge · Automate · Run</div>
              </div>
            </div>

            {/* 上半部分：Hero + 终端 (并排布局) */}
            <div className="flex-1 grid grid-cols-2 gap-6 min-h-0">
              {/* 左：Hero 文字 */}
              <div
                ref={heroIn.ref}
                style={{
                  transform: heroIn.inView ? 'translateY(0)' : 'translateY(30px)',
                  opacity: heroIn.inView ? 1 : 0
                }}
                className="transition-all duration-1000 ease-out flex flex-col justify-center pr-2"
              >
                {/* Eyebrow */}
                <div className="inline-flex self-start items-center gap-2 px-3 py-1 rounded-full bg-bg-card backdrop-blur-sm border border-border-light text-[11px] text-text-secondary mb-4 shadow-lg shadow-primary/5">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
                  </span>
                  <Sparkles size={10} className="text-primary" />
                  <span className="font-medium tracking-wide">{t('login.heroEyebrow')}</span>
                </div>

                {/* 标题 */}
                <h1 className="text-4xl xl:text-5xl 2xl:text-6xl font-bold text-text-primary leading-[1.05] tracking-[-0.03em] mb-4">
                  <span className="block text-text-primary">{t('login.heroTitlePrefix')}</span>
                  <span className="block bg-gradient-to-r from-primary via-purple-400 to-pink-400 bg-clip-text text-transparent animate-[gradient-shift_8s_ease-in-out_infinite] bg-[length:200%_auto]">
                    {t('login.heroTitleGradient')}
                  </span>
                </h1>

                {/* 副标题 */}
                <p className="text-sm xl:text-base text-text-secondary leading-[1.7] tracking-wide">
                  {t('login.heroSubtitle')}
                </p>
              </div>

              {/* 右：终端代码演示 */}
              <div className="flex items-center">
                <TerminalPreview />
              </div>
            </div>

            {/* 下半部分：特性卡片 — 3 列 2 行，紧凑 */}
            <div className="mt-6 grid grid-cols-3 gap-3">
              {features.map((f, i) => (
                <FeatureCard
                  key={f.titleKey}
                  icon={f.icon}
                  title={t(f.titleKey)}
                  desc={t(f.descKey)}
                  delay={i * 60}
                  gradient={f.gradient}
                  compact
                />
              ))}
            </div>

            {/* 底部标语 */}
            <div className="mt-4 pt-3 border-t border-border-light">
              <p className="text-[10px] text-text-muted tracking-[0.3em] uppercase text-center">
                {t('login.bottomTagline')}
              </p>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════
            右侧：悬浮登录卡片（40% 宽，磨砂玻璃）
            ════════════════════════════════════════════ */}
        <div className="w-full lg:w-[40%] relative flex items-center justify-center p-6 lg:p-10">
          {/* 移动端与桌面端共享同一页面级背景 */}

          <div className="relative w-full max-w-md">
            {/* 移动端才显示的品牌名 */}
            <div className="lg:hidden text-center mb-6">
              <h1 className="text-2xl font-bold text-text-primary">TaskForge</h1>
            </div>

            {/* 登录卡片：渐变描边 + 主题卡片背景（浅深色均自适应） */}
            <div className="relative p-[1px] rounded-3xl bg-gradient-to-br from-primary/40 via-primary/15 to-purple-500/20 shadow-2xl">
              <div className="bg-bg-card backdrop-blur-2xl rounded-3xl border border-border-light p-8 lg:p-10 relative overflow-hidden">
                {/* 顶部高光线 — 玻璃卡片的标志性细节 */}
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
                {/* 品牌标识 */}
                <div className="flex items-center gap-3 mb-7">
                  <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-primary via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-primary/30 ring-1 ring-white/20">
                    <span className="text-white font-bold text-lg tracking-tight">T</span>
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-tr from-white/0 via-white/10 to-white/0 opacity-50" />
                  </div>
                  <div>
                    <div className="text-text-primary font-semibold text-base tracking-tight">
                      TaskForge
                    </div>
                    <div className="text-text-muted text-xs tracking-wide">
                      {t('login.tabLogin')} · {t('login.tabRegister')}
                    </div>
                  </div>
                </div>

                {/* Tab + 表单头部 */}
                <div className="mb-6">
                  <h2 className="text-2xl font-semibold text-text-primary mb-1 tracking-tight">
                    {t(modeTitles[mode].titleKey)}
                  </h2>
                  <p className="text-sm text-text-secondary">
                    {mode === 'setup' && '首次启动，请创建管理员账号'}
                    {mode === 'login' && '欢迎回来，请输入凭据登录'}
                    {mode === 'register' && '创建新账号加入 TaskForge'}
                  </p>
                </div>

                {/* Server URL */}
                <div className="mb-5">
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">
                    {t('login.serverUrl')}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={serverUrl}
                      onChange={(e) => setServerUrl(e.target.value)}
                      placeholder={t('login.serverUrlPlaceholder')}
                      className="flex-1 px-3 py-2 rounded-lg bg-bg-input border border-border-light text-text-primary placeholder-text-muted text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-colors"
                    />
                    <button
                      onClick={handleSaveUrl}
                      disabled={serverLoading}
                      className="flex items-center gap-1.5 px-3 py-2 bg-bg-input border border-border-light rounded-lg text-text-secondary hover:bg-bg-tertiary hover:border-border-hover transition-all text-sm disabled:opacity-50"
                    >
                      <Server className={`w-3.5 h-3.5 ${serverLoading ? 'animate-pulse' : ''}`} />
                      {t('login.connect')}
                    </button>
                  </div>
                </div>

                {/* Mode Tabs */}
                <div className="flex bg-bg-tertiary rounded-lg p-1 mb-6 border border-border-light">
                  {visibleModes.map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`group flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                        mode === m
                          ? 'bg-gradient-to-r from-primary to-primary-hover text-white shadow-sm shadow-primary/30'
                          : 'text-text-secondary hover:text-text-primary hover:bg-bg-card-hover'
                      }`}
                    >
                      <span
                        className={`transition-transform duration-300 ${
                          mode === m ? '' : 'group-hover:scale-110'
                        }`}
                      >
                        {modeTitles[m].icon}
                      </span>
                      {t(modeTitles[m].titleKey)}
                    </button>
                  ))}
                </div>

                {/* 登录/注册/初始化表单 */}
                <form onSubmit={handleSubmit} className="space-y-3.5">
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
                        className="w-full px-3 py-2.5 rounded-lg bg-bg-input border border-border-light text-text-primary placeholder-text-muted text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-colors"
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
                      className="w-full px-3 py-2.5 rounded-lg bg-bg-input border border-border-light text-text-primary placeholder-text-muted text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-colors"
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
                      className="w-full px-3 py-2.5 rounded-lg bg-bg-input border border-border-light text-text-primary placeholder-text-muted text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-colors"
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
                        className="w-full px-3 py-2.5 rounded-lg bg-bg-input border border-border-light text-text-primary placeholder-text-muted text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-colors"
                      />
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-gradient-to-r from-primary to-primary-hover hover:from-primary-hover hover:to-primary text-white font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:shadow-xl"
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

                {/* 信任徽章 */}
                <div className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-text-muted">
                  <ShieldCheck size={12} className="text-emerald-500/70" />
                  <span>{t('login.securedLocally')}</span>
                </div>
              </div>
            </div>

            <p className="text-center text-text-muted text-xs mt-4">{t('login.version')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

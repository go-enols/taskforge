/**
 * @file LoginPage — Midnight Forge 登录入口
 * @description 完全原创的高级感登录页：
 *              - 极深紫黑画布 (#08070d) + WebGL mesh gradient 环境光
 *              - 居中对称布局：字标在上 → 卡片在中 → 脚注在下
 *              - 字标 TASKFORGE：18px 极宽字距（letter-spacing: 0.4em） + 紫金渐变
 *              - 登录卡片：380px 宽，24px 圆角，背景玻璃拟物
 *              - 能量条提交按钮：4px 极细横线，hover 变 8px + 紫光，loading 充满
 *              - WebGL 角落光斑（左上紫球 + 右下琥珀金球）由 ParticlegroundBg 提供
 *              - 动效：clip-path 揭开入场、字符逐字浮现、focus 光扫
 *              - 后端流程：useAuth().login/register/setup + /api/health 健康检查
 * @module renderer/pages
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { getMarketplaceUrl, setMarketplaceUrl } from '../api'
import { toast } from '../utils/toast'
import TitleBar from '../components/TitleBar'
import { ParticlegroundBg } from '../components/ParticlegroundBg'
import { Loader2, ArrowUpRight, ChevronDown } from 'lucide-react'

/** 鉴权模式：登录 / 注册 / 初始化管理员 */
type AuthMode = 'login' | 'register' | 'setup'

/** 提交按钮在 3 个模式下显示的标签 i18n key */
const SUBMIT_KEY: Record<AuthMode, string> = {
  login: 'login.tabLogin',
  register: 'login.tabRegister',
  setup: 'login.tabSetup'
}

/**
 * BrandMark — 顶部字标
 * 18px 极宽字距（letter-spacing 0.4em）+ 紫金渐变 + 极弱阴影
 * 用 CSS gradient 文字而非 SVG（更轻量）
 */
const BrandMark: React.FC<{ subtitle?: string }> = ({ subtitle }) => (
  <div className="brand-mark">
    <div className="brand-mark__title">TASKFORGE</div>
    {subtitle && <div className="brand-mark__subtitle">{subtitle}</div>}
  </div>
)

/**
 * EnergyButton — 能量条提交按钮
 * 4px 极细横线 + hover 上浮 8px + 紫光描边 + loading 时填充电光
 */
const EnergyButton: React.FC<{
  loading: boolean
  disabled?: boolean
  children: React.ReactNode
  type?: 'submit' | 'button'
  onClick?: () => void
}> = ({ loading, disabled, children, type = 'submit', onClick }) => (
  <button
    type={type}
    onClick={onClick}
    disabled={loading || disabled}
    className="energy-button"
    data-loading={loading ? 'true' : 'false'}
  >
    <span className="energy-button__bar" />
    <span className="energy-button__label">
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </span>
  </button>
)

/**
 * GlowField — 焦点光扫输入框
 * 默认状态：1px hairline 描边 + 占位符柔和灰
 * focus 状态：从左侧射出 1px 紫光扫过（0.6s 动画）
 */
const GlowField: React.FC<{
  type?: 'text' | 'password'
  value: string
  onChange: (v: string) => void
  placeholder: string
  maxLength?: number
  autoComplete?: string
  delay?: number
  optional?: boolean
}> = ({
  type = 'text',
  value,
  onChange,
  placeholder,
  maxLength,
  autoComplete,
  delay = 0,
  optional
}) => (
  <div className="glow-field" style={{ animationDelay: `${delay}ms` }}>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder + (optional ? '（可选）' : '')}
      maxLength={maxLength}
      autoComplete={autoComplete}
      className="glow-field__input"
    />
    <span className="glow-field__sweep" aria-hidden="true" />
  </div>
)

/**
 * LoginPage — Midnight Forge 入口
 *
 * 完全原创设计：
 * 1. 极简居中布局（与 60/40 营销页风格区分）
 * 2. 字标 → 卡片 → 脚注 三段垂直节奏
 * 3. 能量条提交（4px 极细横线 → 紫光填充电量）
 */
const LoginPage: React.FC = () => {
  const { t } = useTranslation()
  const { login, register, setup } = useAuth()

  // ---- 鉴权模式（受 health.needsSetup 决定）----
  const [mode, setMode] = useState<AuthMode>('login')

  // ---- 表单字段（最少必要字段，按需展开）----
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // ---- 服务端地址（折叠在卡片底部）----
  const [serverUrl, setServerUrl] = useState('')
  const [serverExpanded, setServerExpanded] = useState(false)

  // ---- 状态机 ----
  const [loading, setLoading] = useState(false)
  const [serverLoading, setServerLoading] = useState(false)
  const [detecting, setDetecting] = useState(true)
  const [needsSetup, setNeedsSetup] = useState(true)

  // ---- 主题（用于 TitleBar）----
  const [isDark, setIsDark] = useState(true)

  // ---- 派生：是否需要显示 displayName / confirmPassword ----
  const showDisplayName = mode === 'register' || mode === 'setup'
  const showConfirmPassword = mode === 'register' || mode === 'setup'
  const visibleModes: AuthMode[] = useMemo(
    () =>
      needsSetup
        ? (['setup', 'login', 'register'] as AuthMode[])
        : (['login', 'register'] as AuthMode[]),
    [needsSetup]
  )

  // ---- 监听主题变化 ----
  useEffect(() => {
    if (typeof document === 'undefined') return
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'))
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  // ---- 启动时探测服务端 ----
  const checkSetup = useCallback(async () => {
    setDetecting(true)
    try {
      const url = await getMarketplaceUrl()
      const resp = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(3000) })
      if (resp.ok) {
        const health = await resp.json().catch(() => ({}))
        const need = Boolean(health.needsSetup)
        setNeedsSetup(need)
        setMode(need ? 'setup' : 'login')
      }
    } catch {
      setMode('login')
    } finally {
      setDetecting(false)
    }
  }, [])

  useEffect(() => {
    getMarketplaceUrl().then((url) => setServerUrl(url))
    checkSetup()
  }, [checkSetup])

  // ---- 服务端地址保存 ----
  const handleSaveUrl = async (): Promise<void> => {
    if (!serverUrl.trim()) {
      toast.error(t('login.connectFailed'))
      return
    }
    setServerLoading(true)
    try {
      const resp = await fetch(`${serverUrl.trim()}/api/health`, {
        signal: AbortSignal.timeout(5000)
      })
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

  // ---- 提交流程（与原版完全等价）----
  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!username.trim()) {
      toast.error(t('login.requiredUsername'))
      return
    }
    if (!password) {
      toast.error(t('login.requiredPassword'))
      return
    }
    if (showConfirmPassword && password !== confirmPassword) {
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

  // ---- 模式切换时重置非必要字段 ----
  const switchMode = (m: AuthMode): void => {
    setMode(m)
    if (m === 'login') {
      setDisplayName('')
      setConfirmPassword('')
    }
  }

  // ---- 检测阶段：极简居中旋转 ----
  if (detecting) {
    return (
      <div className="forge-page">
        <style>{FORGE_CSS}</style>
        <div className="forge-bg">
          <ParticlegroundBg />
        </div>
        <TitleBar dark={isDark} />
        <main className="forge-center">
          <div className="forge-detect">
            <div className="forge-detect__pulse" />
            <span className="forge-detect__text">detecting</span>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="forge-page">
      <style>{FORGE_CSS}</style>
      <div className="forge-bg">
        <ParticlegroundBg />
      </div>

      <TitleBar dark={isDark} />

      <main className="forge-center">
        <BrandMark subtitle="自动化脚本 · 沙箱执行" />

        {/* 模式 Tabs（极简线段指示器） */}
        <div className="forge-tabs" role="tablist">
          {visibleModes.map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => switchMode(m)}
              className={`forge-tab ${mode === m ? 'forge-tab--active' : ''}`}
            >
              {m === 'login' && t('login.tabLogin')}
              {m === 'register' && t('login.tabRegister')}
              {m === 'setup' && t('login.tabSetup')}
            </button>
          ))}
        </div>

        {/* 登录卡片 */}
        <form className="forge-card" onSubmit={handleSubmit}>
          <div className="forge-card__inner">
            {/* displayName 条件显示（register/setup） */}
            {showDisplayName && (
              <GlowField
                value={displayName}
                onChange={setDisplayName}
                placeholder={t('login.displayNamePlaceholder')}
                maxLength={32}
                autoComplete="off"
                delay={0}
                optional
              />
            )}

            <GlowField
              value={username}
              onChange={setUsername}
              placeholder={t('login.usernamePlaceholder')}
              maxLength={32}
              autoComplete="username"
              delay={80}
            />

            <GlowField
              type="password"
              value={password}
              onChange={setPassword}
              placeholder={
                mode === 'setup'
                  ? t('login.passwordSetupPlaceholder')
                  : t('login.passwordPlaceholder')
              }
              maxLength={32}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              delay={160}
            />

            {showConfirmPassword && (
              <GlowField
                type="password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder={t('login.confirmPasswordPlaceholder')}
                maxLength={32}
                autoComplete="new-password"
                delay={240}
              />
            )}

            <div className="forge-card__divider" />

            <EnergyButton loading={loading} disabled={loading}>
              {loading ? t('login.authenticating') : t(SUBMIT_KEY[mode])}
            </EnergyButton>

            {/* 服务端地址（折叠） */}
            <button
              type="button"
              onClick={() => setServerExpanded((s) => !s)}
              className="forge-server-toggle"
              aria-expanded={serverExpanded}
            >
              <span className="forge-server-toggle__dot" data-detecting={detecting} />
              <span>{t('login.serverUrl')}</span>
              <ChevronDown
                className="h-3 w-3 transition-transform"
                style={{ transform: serverExpanded ? 'rotate(180deg)' : 'none' }}
              />
            </button>
            {serverExpanded && (
              <div className="forge-server-input">
                <input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder={t('login.serverUrlPlaceholder')}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={handleSaveUrl}
                  disabled={serverLoading}
                  className="forge-server-input__btn"
                >
                  {serverLoading ? t('login.processing') : t('login.connect')}
                </button>
              </div>
            )}
          </div>
        </form>

        {/* 脚注 */}
        <footer className="forge-foot">
          <div className="forge-foot__left">
            <span className="forge-foot__version">v0.2.0</span>
            <span className="forge-foot__sep">·</span>
            <span>{t('login.welcomeBack')}</span>
          </div>
          <div className="forge-foot__right">
            {mode === 'login' && !needsSetup && (
              <button
                type="button"
                onClick={() => switchMode('register')}
                className="forge-foot__link"
              >
                {t('login.noAccountPrompt')}
                <ArrowUpRight className="h-3 w-3" />
              </button>
            )}
            {mode !== 'login' && (
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="forge-foot__link"
              >
                {t('login.alreadyMember')}
                <ArrowUpRight className="h-3 w-3" />
              </button>
            )}
          </div>
        </footer>
      </main>
    </div>
  )
}

export default LoginPage

// =============================================================================
// FORGE_CSS — Midnight Forge 视觉语言
//
// 核心设计 token：
//   --canvas: #08070d      极深紫黑（接近 OLED 真黑 + 极弱紫调）
//   --ink:    #f5f3ff      暖白（不是纯白，带极弱紫调）
//   --mute:   #6b6878      次级灰（带紫调，区别于传统灰）
//   --hint:   #3f3d4a      三级灰
//   --line:   #1a1825      描边色（紫调灰）
//   --brand-1: #a78bfa    薰衣草紫
//   --brand-2: #fbbf24    暖琥珀金
//
// 动效曲线：
//   --ease-forge: cubic-bezier(0.16, 1, 0.3, 1)   Linear/Vercel 标准曲线
//
// 动效清单：
//   - clip-path 揭开入场（卡片从中心向四周展开）
//   - 字标紫金渐变 background-position 漂移（aurora-drift 8s）
//   - 焦点光扫（input focus 时 1px 紫光从左到右扫描）
//   - 能量条 hover（4px → 8px + 紫光）
//   - 能量条 loading（充满电光，0% → 100%）
//   - tab 切换（底部 hairline 滑动）
//   - 探测阶段 5px 圆点 pulse
// =============================================================================

const FORGE_CSS = `
* { box-sizing: border-box; }

.forge-page {
  position: relative;
  min-height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: #08070d;
  color: #f5f3ff;
  font-family: var(--font-sans, "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.forge-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

/* ---------- 居中容器 ---------- */
.forge-center {
  position: relative;
  z-index: 10;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 24px 48px;
  gap: 32px;
}

/* ---------- 字标 ---------- */
.brand-mark {
  text-align: center;
  animation: forge-reveal 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.brand-mark__title {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.4em;
  background: linear-gradient(120deg, #a78bfa 0%, #fbbf24 50%, #a78bfa 100%);
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: aurora-drift 8s linear infinite;
  text-indent: 0.4em;
}
.brand-mark__subtitle {
  margin-top: 8px;
  font-size: 11px;
  letter-spacing: 0.25em;
  color: #6b6878;
  text-transform: uppercase;
  text-indent: 0.25em;
}
@keyframes aurora-drift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}

/* ---------- Tabs ---------- */
.forge-tabs {
  display: inline-flex;
  align-items: center;
  gap: 24px;
  animation: forge-reveal 0.7s 0.1s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.forge-tab {
  position: relative;
  padding: 6px 0;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: #6b6878;
  background: transparent;
  border: 0;
  cursor: pointer;
  transition: color 0.2s;
}
.forge-tab:hover { color: #a78bfa; }
.forge-tab--active { color: #f5f3ff; }
.forge-tab--active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -2px;
  height: 1px;
  background: linear-gradient(90deg, transparent, #a78bfa, transparent);
  animation: forge-reveal 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

/* ---------- 卡片 ---------- */
.forge-card {
  width: 100%;
  max-width: 380px;
  position: relative;
  animation: forge-card-open 0.9s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.forge-card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 24px;
  padding: 1px;
  background: linear-gradient(180deg, rgba(167, 139, 250, 0.15), rgba(251, 191, 36, 0.05) 50%, rgba(167, 139, 250, 0.0));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}
.forge-card__inner {
  background: rgba(15, 13, 22, 0.6);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  border-radius: 24px;
  padding: 32px 28px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow:
    0 24px 64px -24px rgba(167, 139, 250, 0.25),
    0 4px 16px -8px rgba(0, 0, 0, 0.6),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
}
.forge-card__divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(167, 139, 250, 0.2), transparent);
  margin: 8px 0 4px;
}

@keyframes forge-card-open {
  0% {
    opacity: 0;
    clip-path: inset(50% 50% 50% 50%);
    transform: scale(0.96);
  }
  100% {
    opacity: 1;
    clip-path: inset(0% 0% 0% 0%);
    transform: scale(1);
  }
}

/* ---------- 输入框（focus 光扫） ---------- */
.glow-field {
  position: relative;
  animation: forge-reveal 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.glow-field__input {
  width: 100%;
  height: 44px;
  padding: 0 14px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid #1a1825;
  border-radius: 10px;
  color: #f5f3ff;
  font-size: 13px;
  font-family: inherit;
  letter-spacing: 0.01em;
  outline: none;
  transition: border-color 0.2s, background 0.2s;
}
.glow-field__input::placeholder {
  color: #3f3d4a;
  transition: color 0.2s;
}
.glow-field__input:hover { border-color: #2a2735; }
.glow-field__input:focus {
  border-color: rgba(167, 139, 250, 0.4);
  background: rgba(167, 139, 250, 0.03);
}
.glow-field__input:focus::placeholder { color: #6b6878; }
.glow-field__sweep {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 1px;
  background: linear-gradient(90deg, transparent, #a78bfa, transparent);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  pointer-events: none;
}
.glow-field__input:focus ~ .glow-field__sweep { transform: scaleX(1); }

/* ---------- 能量条按钮 ---------- */
.energy-button {
  position: relative;
  width: 100%;
  height: 48px;
  margin-top: 4px;
  background: transparent;
  border: 0;
  cursor: pointer;
  font-family: inherit;
  color: #f5f3ff;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.energy-button:disabled { cursor: not-allowed; opacity: 0.5; }
.energy-button:hover:not(:disabled) { transform: translateY(-1px); }
.energy-button:active:not(:disabled) { transform: translateY(0); }

.energy-button__bar {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 4px;
  transform: translateY(-50%);
  background: linear-gradient(90deg, rgba(167, 139, 250, 0.2), rgba(167, 139, 250, 0.5), rgba(251, 191, 36, 0.3));
  border-radius: 2px;
  transition: height 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s;
  box-shadow: 0 0 0 0 rgba(167, 139, 250, 0);
}
.energy-button:hover:not(:disabled) .energy-button__bar {
  height: 8px;
  box-shadow: 0 0 16px 2px rgba(167, 139, 250, 0.4);
}
.energy-button[data-loading="true"] .energy-button__bar {
  height: 8px;
  background: linear-gradient(90deg, #a78bfa 0%, #fbbf24 50%, #a78bfa 100%);
  background-size: 200% auto;
  animation: aurora-drift 1.2s linear infinite;
  box-shadow: 0 0 20px 4px rgba(167, 139, 250, 0.5);
}

.energy-button__label {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 100%;
  padding-top: 4px;
}

/* ---------- 服务端地址（折叠） ---------- */
.forge-server-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 6px;
  padding: 6px 0;
  background: transparent;
  border: 0;
  color: #6b6878;
  font-size: 11px;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: color 0.2s;
  font-family: inherit;
}
.forge-server-toggle:hover { color: #a78bfa; }
.forge-server-toggle__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #a78bfa;
  opacity: 0.6;
  transition: opacity 0.2s;
}
.forge-server-toggle__dot[data-detecting="true"] {
  animation: forge-dot-pulse 1.2s ease-in-out infinite;
}

.forge-server-input {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  animation: forge-reveal 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.forge-server-input input {
  flex: 1;
  height: 32px;
  padding: 0 10px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid #1a1825;
  border-radius: 6px;
  color: #f5f3ff;
  font-size: 11px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s;
}
.forge-server-input input:focus { border-color: rgba(167, 139, 250, 0.4); }
.forge-server-input__btn {
  padding: 0 12px;
  background: rgba(167, 139, 250, 0.1);
  border: 1px solid rgba(167, 139, 250, 0.2);
  border-radius: 6px;
  color: #a78bfa;
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}
.forge-server-input__btn:hover:not(:disabled) {
  background: rgba(167, 139, 250, 0.15);
  border-color: rgba(167, 139, 250, 0.4);
}
.forge-server-input__btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ---------- 脚注 ---------- */
.forge-foot {
  width: 100%;
  max-width: 380px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
  letter-spacing: 0.1em;
  color: #3f3d4a;
  text-transform: uppercase;
  animation: forge-reveal 0.7s 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.forge-foot__left { display: flex; align-items: center; gap: 8px; }
.forge-foot__sep { opacity: 0.4; }
.forge-foot__version {
  padding: 2px 6px;
  border: 1px solid #1a1825;
  border-radius: 3px;
  color: #6b6878;
}
.forge-foot__right { display: flex; align-items: center; gap: 4px; }
.forge-foot__link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: transparent;
  border: 0;
  color: #6b6878;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-family: inherit;
  cursor: pointer;
  transition: color 0.2s;
}
.forge-foot__link:hover { color: #a78bfa; }

/* ---------- 探测阶段 ---------- */
.forge-detect {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #6b6878;
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}
.forge-detect__pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #a78bfa;
  animation: forge-dot-pulse 1.2s ease-in-out infinite;
}
.forge-detect__text {
  font-family: "SF Mono", "Monaco", "Consolas", monospace;
}

/* ---------- 全局动画 ---------- */
@keyframes forge-reveal {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes forge-dot-pulse {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); box-shadow: 0 0 8px currentColor; }
}

/* ---------- WebKit autofill ---------- */
.glow-field__input:-webkit-autofill,
.glow-field__input:-webkit-autofill:hover,
.glow-field__input:-webkit-autofill:focus,
.forge-server-input input:-webkit-autofill,
.forge-server-input input:-webkit-autofill:hover,
.forge-server-input input:-webkit-autofill:focus {
  -webkit-text-fill-color: #f5f3ff;
  -webkit-box-shadow: 0 0 0 1000px rgba(15, 13, 22, 0.8) inset;
  transition: background-color 9999s ease-in-out 0s;
}

/* ---------- 滚动条 ---------- */
.forge-page ::-webkit-scrollbar { width: 6px; }
.forge-page ::-webkit-scrollbar-track { background: transparent; }
.forge-page ::-webkit-scrollbar-thumb { background: #1a1825; border-radius: 3px; }
`

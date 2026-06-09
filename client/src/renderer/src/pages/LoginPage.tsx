/**
 * @file LoginPage — 登录/注册/初始化页面
 * @description 视觉严格复刻 reference HTML（Kylin奇霖 粒子登录模板）：
 *              - 蓝色径向渐变背景（#1e4877 → #4584b4，CSS linear-gradient）
 *              - 全屏 Three.js 8K 粒子隧道背景（ParticlegroundBg）
 *              - 玻璃拟物登录卡片（rgba(255,255,255,0.08) + backdrop-blur + 圆角 16 + box-shadow）
 *              - HTML 风格类名（login / login_title / login_fields / login_fields__user / __password / __submit / icon / validation / success / disclaimer）
 *              - 输入框 focus 状态有边框亮起 + 背景变亮
 *              - 提交按钮 hover 上浮 + 阴影加深
 *              - 提交时按钮文案改为"认证中..."并禁用
 *
 *              后端 / 状态按 React：
 *              - useAuth().login / register / setup
 *              - i18n 走 zh-CN.json（useTranslation）
 *              - 受控表单 + 必填字段校验
 *              - handleSubmit 不变（mode 切换 + 字段验证 + 调用后端）
 * @module renderer/pages
 */

import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { getMarketplaceUrl, setMarketplaceUrl } from '../api'
import { toast } from '../utils/toast'
import TitleBar from '../components/TitleBar'
import { ParticlegroundBg } from '../components/ParticlegroundBg'

/** 页面模式：登录 / 注册 / 管理员初始化 */
type Mode = 'login' | 'register' | 'setup'

/**
 * LoginCardProps — 登录卡片 props（与原 React 状态完全兼容）
 */
interface LoginCardProps {
  mode: Mode
  visibleModes: Mode[]
  onModeChange: (m: Mode) => void
  onSubmit: (e: React.FormEvent) => void
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
  onSaveUrl: () => void
}

const LoginCard: React.FC<LoginCardProps> = ({
  mode,
  visibleModes,
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

  /** displayName 字段：仅在 register/setup 模式显示 */
  const showDisplayName = mode === 'register' || mode === 'setup'
  /** confirmPassword 字段：仅在 register/setup 模式显示 */
  const showConfirmPassword = mode === 'register' || mode === 'setup'

  /** 模式 Tabs（多模式时显示） */
  const tabs = (
    <div className="login_tabs">
      {visibleModes.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onModeChange(m)}
          className={`login_tab ${mode === m ? 'login_tab--active' : ''}`}
        >
          {m === 'login' && t('login.tabLogin')}
          {m === 'register' && t('login.tabRegister')}
          {m === 'setup' && t('login.tabSetup')}
        </button>
      ))}
    </div>
  )

  return (
    <div className="login">
      <div className="login_title">
        <span>{t('login.adminLogin')}</span>
      </div>

      {visibleModes.length > 1 && tabs}

      <form onSubmit={onSubmit}>
        <div className="login_fields">
          {/* 显示名称（仅注册/初始化时显示） */}
          {showDisplayName && (
            <div className="login_fields__user">
              <div className="icon">
                <UserIcon />
              </div>
              <input
                name="displayName"
                placeholder={t('login.displayNamePlaceholder')}
                maxLength={32}
                type="text"
                autoComplete="off"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <div className="validation">
                <TickIcon />
              </div>
            </div>
          )}

          {/* 用户名 */}
          <div className="login_fields__user">
            <div className="icon">
              <UserIcon />
            </div>
            <input
              name="login"
              placeholder={t('login.usernamePlaceholder')}
              maxLength={32}
              type="text"
              autoComplete="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <div className="validation">
              <TickIcon />
            </div>
          </div>

          {/* 密码 */}
          <div className="login_fields__password">
            <div className="icon">
              <LockIcon />
            </div>
            <input
              name="pwd"
              placeholder={
                mode === 'setup'
                  ? t('login.passwordSetupPlaceholder')
                  : t('login.passwordPlaceholder')
              }
              maxLength={32}
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="validation">
              <TickIcon />
            </div>
          </div>

          {/* 确认密码（仅注册/初始化时显示） */}
          {showConfirmPassword && (
            <div className="login_fields__password">
              <div className="icon">
                <LockIcon />
              </div>
              <input
                name="confirmPwd"
                placeholder={t('login.confirmPasswordPlaceholder')}
                maxLength={32}
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <div className="validation">
                <TickIcon />
              </div>
            </div>
          )}

          {/* 提交按钮 */}
          <div className="login_fields__submit">
            <input
              type="submit"
              value={loading ? t('login.authenticating') : t('login.tabLogin')}
              disabled={loading}
            />
          </div>
        </div>
      </form>

      <div className="success" />
      <div className="disclaimer">
        <p>{t('login.welcomeBack')}</p>
      </div>

      {/* 服务端地址（折叠在卡片底部，可选） */}
      <div className="login_server_url">
        <input
          type="text"
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          placeholder={t('login.serverUrlPlaceholder')}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={onSaveUrl}
          disabled={serverLoading}
          className="login_server_url__btn"
        >
          {t('login.connect')}
        </button>
      </div>
    </div>
  )
}

// ---------- 内联 SVG 图标（避免 emoji，遵循 HTML 的 icon 风格） ----------

const UserIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
    <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v2h20v-2c0-3.33-6.67-5-10-5z" />
  </svg>
)

const LockIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z" />
  </svg>
)

const TickIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
    <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
  </svg>
)

/**
 * LoginPage — 登录/注册/初始化页面组件
 *
 * 1. 启动时检测服务端 health，根据 needsSetup 切换模式
 * 2. 用户输入表单字段，点击提交
 * 3. 校验：必填字段 → 后端
 * 4. 提交期间按钮文案变为"认证中..."并禁用
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

  /** 表单提交：login / register / setup 共享一个入口 */
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

  if (detecting) {
    return (
      <div className="login-page">
        <style>{LOGIN_CSS}</style>
        <ParticlegroundBg />
        <div className="login-page__inner">
          <TitleBar dark={isDark} />
          <div className="login-page__center">
            <div className="login-page__spinner" />
          </div>
        </div>
      </div>
    )
  }

  const visibleModes: Mode[] = needsSetup ? ['setup', 'login', 'register'] : ['login', 'register']

  return (
    <div className="login-page">
      <style>{LOGIN_CSS}</style>
      <ParticlegroundBg />

      <div className="login-page__inner">
        <TitleBar dark={isDark} />

        <div className="login-page__center">
          <LoginCard
            mode={mode}
            visibleModes={visibleModes}
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
  )
}

// =================================================================
// LOGIN_CSS — 严格按 reference HTML 视觉的 CSS（内联到 <style>，无外部依赖）
//
// 来源：原 HTML 引用了 default.css / styles.css / demo.css / loaders.css，
// 这里把它们的核心样式合并并适配 React 渲染。结构类名完全沿用：
//   .login  .login_title  .login_fields  .login_fields__user
//   .login_fields__password  .login_fields__submit  .icon
//   .validation  .success  .disclaimer
// 核心特效：
//   1) 蓝色径向渐变背景（#1e4877 → #4584b4）
//   2) 玻璃拟物卡片（rgba 背景 + backdrop-blur + 圆角 16 + 阴影）
//   3) 输入框 focus 时边框 + 背景柔光亮起
//   4) 提交按钮 hover 上浮 + 阴影加深
//   5) tab 切换平滑动画
// =================================================================

const LOGIN_CSS = `
* { box-sizing: border-box; }

/* ---------- 页面根 ---------- */
.login-page {
  position: relative;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  /* 与 HTML 一致：#1e4877 → #4584b4 蓝色径向渐变 */
  background: linear-gradient(180deg, #1e4877 0%, #4584b4 100%);
  color: #fff;
  font-family: "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif;
}
.login-page__inner {
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  height: 100%;
}
.login-page__center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  overflow-y: auto;
}
.login-page__spinner {
  width: 32px;
  height: 32px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: login-spin 0.8s linear infinite;
}
@keyframes login-spin {
  to { transform: rotate(360deg); }
}

/* ---------- login 卡片（HTML 原版结构，玻璃拟物特效） ---------- */
.login {
  width: 360px;
  max-width: 100%;
  /* 玻璃拟物核心：半透明白 + 背景模糊 + 细描边 + 圆角 + 投影 */
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 16px;
  padding: 28px 24px 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  position: relative;
  /* 入场动画 */
  animation: login-card-in 0.4s ease-out;
}
@keyframes login-card-in {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
.login_title {
  text-align: center;
  margin-bottom: 18px;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 1px;
  color: #fff;
}
.login_title span {
  display: inline-block;
  padding: 6px 18px;
  border-bottom: 2px solid rgba(255, 255, 255, 0.5);
}

/* ---------- Tabs（login/register/setup） ---------- */
.login_tabs {
  display: flex;
  background: rgba(0, 0, 0, 0.18);
  border-radius: 8px;
  padding: 3px;
  margin-bottom: 16px;
}
.login_tab {
  flex: 1;
  padding: 6px 0;
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  border: 0;
  cursor: pointer;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  transition: background 0.2s, color 0.2s;
}
.login_tab:hover {
  color: #fff;
}
.login_tab--active {
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

/* ---------- 字段（HTML 原版：.login_fields__user / __password） ---------- */
.login_fields {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.login_fields__user,
.login_fields__password {
  position: relative;
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  height: 40px;
  /* 焦点过渡 */
  transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
}
.login_fields__user:focus-within,
.login_fields__password:focus-within {
  border-color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.1);
  /* 焦点光晕 */
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.08);
}
.login_fields__user .icon,
.login_fields__password .icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  color: rgba(255, 255, 255, 0.7);
  flex-shrink: 0;
  transition: color 0.2s;
}
.login_fields__user:focus-within .icon,
.login_fields__password:focus-within .icon {
  color: #fff;
}
.login_fields__user input,
.login_fields__password input {
  flex: 1;
  background: transparent;
  border: 0;
  outline: none;
  color: #fff;
  font-size: 13px;
  height: 100%;
  padding: 0;
}
.login_fields__user input::placeholder,
.login_fields__password input::placeholder {
  color: rgba(255, 255, 255, 0.45);
}
.login_fields__password input[type="password"] {
  letter-spacing: 1px;
}
.validation {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  color: rgba(255, 255, 255, 0.4);
  flex-shrink: 0;
}

/* ---------- 提交按钮（HTML 原版：.login_fields__submit） ---------- */
.login_fields__submit {
  margin-top: 8px;
}
.login_fields__submit input {
  width: 100%;
  height: 40px;
  border: 0;
  border-radius: 8px;
  background: linear-gradient(180deg, #4a90e2 0%, #357abd 100%);
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 4px;
  cursor: pointer;
  /* 悬浮过渡 */
  transition: transform 0.15s, box-shadow 0.2s, opacity 0.2s;
  box-shadow: 0 4px 12px rgba(53, 122, 189, 0.4);
}
.login_fields__submit input:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(53, 122, 189, 0.55);
}
.login_fields__submit input:active:not(:disabled) {
  transform: translateY(0);
}
.login_fields__submit input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ---------- 成功提示 + 底部声明 ---------- */
.success {
  display: none; /* 提交成功时由业务方控制 */
}
.disclaimer {
  text-align: center;
  margin-top: 12px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  letter-spacing: 1px;
}

/* ---------- 服务端地址（卡片底部） ---------- */
.login_server_url {
  display: flex;
  gap: 6px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}
.login_server_url input {
  flex: 1;
  height: 32px;
  background: rgba(0, 0, 0, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 0 10px;
  color: #fff;
  font-size: 11px;
  outline: none;
  transition: border-color 0.2s, background 0.2s;
}
.login_server_url input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}
.login_server_url input:focus {
  border-color: rgba(255, 255, 255, 0.4);
  background: rgba(0, 0, 0, 0.25);
}
.login_server_url__btn {
  height: 32px;
  padding: 0 14px;
  border: 0;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;
}
.login_server_url__btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.25);
}
.login_server_url__btn:active:not(:disabled) {
  transform: scale(0.97);
}
.login_server_url__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ---------- 输入框自动填充：强制深色背景 + 白字 ---------- */
.login_fields__user input:-webkit-autofill,
.login_fields__user input:-webkit-autofill:hover,
.login_fields__user input:-webkit-autofill:focus,
.login_fields__password input:-webkit-autofill,
.login_fields__password input:-webkit-autofill:hover,
.login_fields__password input:-webkit-autofill:focus,
.login_server_url input:-webkit-autofill,
.login_server_url input:-webkit-autofill:hover,
.login_server_url input:-webkit-autofill:focus {
  -webkit-text-fill-color: #fff;
  -webkit-box-shadow: 0 0 0 1000px rgba(0, 0, 0, 0.18) inset;
  transition: background-color 9999s ease-in-out 0s;
}
`

/**
 * @file LoginPage — 登录/注册/初始化页面
 * @description 提供管理员初始化（setup）、用户登录和注册功能。
 *              首次启动时自动检测服务端是否需要初始化。
 *              视觉风格：3D WebGL 粒子隧道背景（Three.js）+ 居中半透明登录卡片。
 *              背景为 #1e4877 → #4584b4 蓝色渐变，相机跟随鼠标平滑插值。
 * @module renderer/pages
 */

import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { getMarketplaceUrl, setMarketplaceUrl } from '../api'
import { toast } from '../utils/toast'
import TitleBar from '../components/TitleBar'
import WebGLParticleBackground from '../components/WebGLParticleBackground'

/** 页面模式：登录 / 注册 / 管理员初始化 */
type Mode = 'login' | 'register' | 'setup'

/**
 * LoginCard — 居中的半透明登录卡片
 *
 * Props 与原版一致，保留所有提交流程。仅视觉层换为玻璃拟物风格
 * （白/10 背景 + backdrop-blur + 白色细描边），与 WebGL 粒子背景协调。
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
  verifyCode: string
  setVerifyCode: (v: string) => void
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
  verifyCode,
  setVerifyCode,
  serverUrl,
  setServerUrl,
  serverLoading,
  onSaveUrl
}) => {
  const { t } = useTranslation()

  /** 表单输入框的统一样式：半透明白底 + 白色描边 + focus 蓝色环 */
  const inputClass =
    'w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 text-sm ' +
    'focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-colors outline-none'
  const labelClass = 'block text-xs font-medium text-white/70 mb-1.5'

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 p-7">
      {/* 标题 */}
      <h1 className="text-2xl font-semibold text-white text-center mb-6 tracking-wide">
        {t('login.adminLogin')}
      </h1>

      {/* 模式 Tabs（多模式时显示） */}
      {visibleModes.length > 1 && (
        <div className="flex bg-white/10 rounded-lg p-1 mb-5">
          {visibleModes.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                mode === m
                  ? 'bg-primary text-white shadow'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              {m === 'login' && t('login.tabLogin')}
              {m === 'register' && t('login.tabRegister')}
              {m === 'setup' && t('login.tabSetup')}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4" autoComplete="off">
        {/* 显示名称（仅注册/初始化时显示） */}
        {(mode === 'register' || mode === 'setup') && (
          <div>
            <label className={labelClass}>{t('login.displayName')}</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('login.displayNamePlaceholder')}
              className={inputClass}
              autoComplete="off"
            />
          </div>
        )}

        {/* 用户名 */}
        <div>
          <label className={labelClass}>{t('login.username')}</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t('login.usernamePlaceholder')}
            className={inputClass}
            autoComplete="username"
          />
        </div>

        {/* 密码 */}
        <div>
          <label className={labelClass}>{t('login.password')}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={
              mode === 'setup' ? t('login.passwordSetupPlaceholder') : t('login.passwordPlaceholder')
            }
            className={inputClass}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </div>

        {/* 确认密码（仅注册/初始化时显示） */}
        {(mode === 'register' || mode === 'setup') && (
          <div>
            <label className={labelClass}>{t('login.confirmPassword')}</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('login.confirmPasswordPlaceholder')}
              className={inputClass}
              autoComplete="new-password"
            />
          </div>
        )}

        {/* 验证码（可选，4 位） */}
        <div>
          <label className={labelClass}>{t('login.verifyCode')}</label>
          <input
            type="text"
            value={verifyCode}
            onChange={(e) => setVerifyCode(e.target.value.slice(0, 4))}
            placeholder={t('login.verifyCodePlaceholder')}
            maxLength={4}
            className={inputClass}
            autoComplete="off"
          />
        </div>

        {/* 提交按钮 */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-lg bg-primary text-white font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
        >
          {loading ? t('login.processing') : t('login.tabLogin')}
        </button>
      </form>

      {/* 服务端地址（折叠在卡片底部，可选） */}
      <div className="mt-5 pt-4 border-t border-white/10">
        <label className={labelClass}>{t('login.serverUrl')}</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder={t('login.serverUrlPlaceholder')}
            className={`${inputClass} flex-1`}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={onSaveUrl}
            disabled={serverLoading}
            className="px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white text-sm font-medium hover:bg-white/20 transition-colors disabled:opacity-50"
          >
            {t('login.connect')}
          </button>
        </div>
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
  const [verifyCode, setVerifyCode] = useState('')
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

  // 检测中：保留 TitleBar + 居中 spinner
  if (detecting) {
    return (
      <div className="relative h-screen w-screen overflow-hidden bg-gradient-to-b from-[#1e4877] to-[#4584b4]">
        <WebGLParticleBackground />
        <div className="relative z-10 flex flex-col h-full">
          <TitleBar dark={isDark} />
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-white/30 border-t-white" />
          </div>
        </div>
      </div>
    )
  }

  const visibleModes: Mode[] = needsSetup
    ? ['setup', 'login', 'register']
    : ['login', 'register']

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-gradient-to-b from-[#1e4877] to-[#4584b4]">
      {/* 3D 粒子隧道背景（最底层，固定全屏） */}
      <WebGLParticleBackground />

      {/* 前景内容 */}
      <div className="relative z-10 flex flex-col h-full">
        {/* 标题栏：dark 模式（透明深色） */}
        <TitleBar dark={isDark} />

        {/* 居中登录卡片 */}
        <div className="flex-1 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-sm">
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
              verifyCode={verifyCode}
              setVerifyCode={setVerifyCode}
              serverUrl={serverUrl}
              setServerUrl={setServerUrl}
              serverLoading={serverLoading}
              onSaveUrl={handleSaveUrl}
            />
            {/* 底部欢迎语 */}
            <div className="mt-6 text-center text-white/80 text-sm tracking-wide">
              {t('login.welcomeBack')}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

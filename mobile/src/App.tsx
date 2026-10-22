/**
 * @file TaskForge 移动端 PWA 主应用
 * @description 登录/注册/初始化、脚本市场、模板市场、个人中心；移动端优先，支持安装到桌面。
 * @module mobile/src
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ApiError,
  authApi,
  getCachedUser,
  getToken,
  scriptApi,
  setCachedUser,
  setToken,
  templateApi,
  userApi,
  type HealthInfo,
  type ProjectTemplateItem,
  type ScriptItem,
  type ScriptVersion,
  type TemplateItem,
  type User
} from './api'
import { isNativeApp, onNodeEvent, pingNodeRuntime, type RuntimePing } from './native'
import {
  deleteInstalledTask,
  installScriptToDevice,
  listInstalledTasks,
  loadTaskConfig,
  runInstalledTask,
  stopInstalledTask,
  syncTasksFromRuntime,
  type InstalledTask,
  type TaskLogEntry,
  type TaskRunStatus
} from './tasks'

/* ────────────────────────── 类型与工具 ────────────────────────── */

type Tab = 'market' | 'templates' | 'tasks' | 'profile'
type ToastType = 'info' | 'success' | 'error'

/** 静态资源前缀（Web: /app/，Android: ./） */
const ICON_BASE = `${import.meta.env.BASE_URL}icons/`

interface ToastState {
  text: string
  type: ToastType
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  developer: '开发者',
  user: '普通用户'
}

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role
}

/** 相对时间（列表用） */
function timeAgo(iso?: string): string {
  if (!iso) return ''
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return ''
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return new Date(ts).toLocaleDateString()
}

/** 日期格式化 */
function formatDate(iso?: string): string {
  if (!iso) return ''
  const ts = Date.parse(iso)
  return Number.isNaN(ts) ? '' : new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

/** 复制到剪贴板（带旧浏览器回退） */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      const ok = document.execCommand('copy')
      textarea.remove()
      return ok
    } catch {
      return false
    }
  }
}

/** 是否为 iOS Safari */
function isIosSafari(): boolean {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua)
}

/** 是否已作为 PWA 独立窗口运行 */
function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/* ────────────────────────── 通用组件 ────────────────────────── */

function Spinner({ size = 18 }: { size?: number }): React.JSX.Element {
  return <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />
}

function EmptyState({
  icon,
  title,
  description
}: {
  icon: string
  title: string
  description?: string
}): React.JSX.Element {
  return (
    <div className="empty-state">
      <div className="empty-state__icon" aria-hidden="true">
        {icon}
      </div>
      <p className="empty-state__title">{title}</p>
      {description ? <p className="empty-state__desc">{description}</p> : null}
    </div>
  )
}

function Sheet({
  title,
  subtitle,
  onClose,
  children,
  footer
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}): React.JSX.Element {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sheet-overlay" role="presentation" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet__grabber" aria-hidden="true" />
        <header className="sheet__header">
          <div>
            <h2 className="sheet__title">{title}</h2>
            {subtitle ? <p className="sheet__subtitle">{subtitle}</p> : null}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </header>
        <div className="sheet__body">{children}</div>
        {footer ? <div className="sheet__footer">{footer}</div> : null}
      </div>
    </div>
  )
}

function InstallBanner({
  event,
  onDismiss,
  onInstalled
}: {
  event: BeforeInstallPromptEvent | null
  onDismiss: () => void
  onInstalled: () => void
}): React.JSX.Element | null {
  if (isStandalone()) return null
  const ios = isIosSafari()

  const install = async (): Promise<void> => {
    if (!event) return
    await event.prompt()
    const choice = await event.userChoice
    if (choice.outcome === 'accepted') onInstalled()
    onDismiss()
  }

  return (
    <div className="install-banner">
      <span className="install-banner__icon" aria-hidden="true">
        📲
      </span>
      <div className="install-banner__text">
        <strong>安装到手机桌面</strong>
        <span>{ios ? 'Safari 分享 → 添加到主屏幕' : '像 App 一样全屏使用'}</span>
      </div>
      {event ? (
        <button type="button" className="btn btn--small btn--primary" onClick={install}>
          安装
        </button>
      ) : null}
      <button type="button" className="icon-button" onClick={onDismiss} aria-label="不再提示">
        ✕
      </button>
    </div>
  )
}

/* ────────────────────────── 登录 / 注册 / 初始化 ────────────────────────── */

type AuthMode = 'login' | 'register' | 'setup'

function AuthScreen({
  health,
  onAuthed,
  notify
}: {
  health: HealthInfo | null
  onAuthed: (user: User, token: string) => void
  notify: (text: string, type?: ToastType) => void
}): React.JSX.Element {
  const needsSetup = health?.needsSetup === true
  const [mode, setMode] = useState<AuthMode>(needsSetup ? 'setup' : 'login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (needsSetup && mode === 'login') setMode('setup')
  }, [needsSetup, mode])

  const submit = async (submitEvent: React.FormEvent): Promise<void> => {
    submitEvent.preventDefault()
    setError('')

    if (!username.trim() || !password) {
      setError('请输入用户名和密码')
      return
    }
    if ((mode === 'register' || mode === 'setup') && password.length < 8) {
      setError('密码至少需要 8 个字符')
      return
    }
    if (mode !== 'login' && password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    setLoading(true)
    try {
      const result =
        mode === 'login'
          ? await authApi.login(username.trim(), password)
          : mode === 'register'
            ? await authApi.register(username.trim(), password, displayName.trim() || undefined)
            : await authApi.setup(username.trim(), password, displayName.trim() || undefined)
      onAuthed(result.user, result.token)
      if (mode === 'setup') {
        notify('管理员初始化完成，请妥善保管密码', 'success')
      } else if (mode === 'register') {
        notify('注册成功，已自动登录', 'success')
      } else {
        notify(`欢迎回来，${result.user.displayName || result.user.username}`, 'success')
      }
      if ('apiKey' in result && result.apiKey) {
        notify('API Key 已生成，可在「我的」中重新生成', 'info')
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '操作失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const tabs: Array<{ key: AuthMode; label: string }> = [
    { key: 'login', label: '登录' },
    { key: 'register', label: '注册' },
    ...(needsSetup ? [{ key: 'setup' as AuthMode, label: '初始化管理员' }] : [])
  ]

  return (
    <div className="auth-page">
      <div className="auth-glow" aria-hidden="true" />
      <div className="auth-brand">
        <img src={`${ICON_BASE}icon-192.png`} alt="" className="auth-brand__logo" />
        <h1 className="auth-brand__name">TASKFORGE</h1>
        <p className="auth-brand__subtitle">自动化脚本 · 市场 · 移动端</p>
      </div>

      <div className="auth-card">
        <div className="auth-tabs" role="tablist" aria-label="账号操作">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={mode === tab.key}
              className={`auth-tab${mode === tab.key ? ' auth-tab--active' : ''}`}
              onClick={() => {
                setMode(tab.key)
                setError('')
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {needsSetup && mode === 'setup' ? (
          <p className="auth-hint">首次使用：创建第一个管理员账号（密码至少 8 位）</p>
        ) : null}

        <form className="auth-form" onSubmit={submit}>
          <label className="field">
            <span className="field__label">用户名</span>
            <input
              className="field__input"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="请输入用户名"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>

          {mode !== 'login' ? (
            <label className="field">
              <span className="field__label">显示名称（可选）</span>
              <input
                className="field__input"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="例如：张三"
                autoComplete="nickname"
              />
            </label>
          ) : null}

          <label className="field">
            <span className="field__label">密码</span>
            <input
              className="field__input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={mode === 'login' ? '请输入密码' : '至少 8 个字符'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>

          {mode !== 'login' ? (
            <label className="field">
              <span className="field__label">确认密码</span>
              <input
                className="field__input"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="再次输入密码"
                autoComplete="new-password"
              />
            </label>
          ) : null}

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="btn btn--primary btn--block" disabled={loading}>
            {loading ? <Spinner /> : null}
            {mode === 'login' ? '登录' : mode === 'register' ? '注册并登录' : '创建管理员'}
          </button>
        </form>

        <p className="auth-footnote">
          服务器：{typeof window !== 'undefined' ? window.location.origin : ''}
          {health ? (health.db === 'connected' ? ' · 服务正常' : ' · 服务异常') : ''}
        </p>
      </div>
    </div>
  )
}

/* ────────────────────────── 脚本市场 ────────────────────────── */

function ScriptCard({
  script,
  onOpen
}: {
  script: ScriptItem
  onOpen: () => void
}): React.JSX.Element {
  const pending = script.reviewStatus && script.reviewStatus !== 'approved'
  return (
    <button type="button" className="script-card" onClick={onOpen}>
      <div className="script-card__top">
        <div className="script-card__title-line">
          <h3 className="script-card__name">{script.name}</h3>
          <span className="pill">v{script.version}</span>
        </div>
        <span className="script-card__arrow" aria-hidden="true">
          ›
        </span>
      </div>
      {script.description ? <p className="script-card__desc">{script.description}</p> : null}
      <div className="script-card__meta">
        {script.createdByName ? <span className="script-card__author">{script.createdByName}</span> : null}
        {typeof script.downloads === 'number' ? <span>↓ {script.downloads}</span> : null}
        {typeof script.avgRating === 'number' && script.avgRating > 0 ? (
          <span>★ {script.avgRating.toFixed(1)}</span>
        ) : null}
        {script.updatedAt ? <span>{timeAgo(script.updatedAt)}</span> : null}
        {pending ? (
          <span className={`pill pill--${script.reviewStatus === 'rejected' ? 'danger' : 'warn'}`}>
            {script.reviewStatus === 'rejected' ? '已拒绝' : '审核中'}
          </span>
        ) : null}
      </div>
      {Array.isArray(script.tags) && script.tags.length > 0 ? (
        <div className="tag-row">
          {script.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </button>
  )
}

function ScriptSheet({
  script,
  onClose,
  notify,
  native,
  onInstalled
}: {
  script: ScriptItem
  onClose: () => void
  notify: (text: string, type?: ToastType) => void
  native: boolean
  onInstalled: (task: InstalledTask) => void
}): React.JSX.Element {
  const [versions, setVersions] = useState<ScriptVersion[] | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [showSchema, setShowSchema] = useState(false)

  useEffect(() => {
    let cancelled = false
    scriptApi
      .versions(script.id)
      .then((items) => {
        if (!cancelled) setVersions(items)
      })
      .catch(() => {
        if (!cancelled) setVersions([])
      })
    return () => {
      cancelled = true
    }
  }, [script.id])

  const download = async (): Promise<void> => {
    setDownloading(true)
    try {
      await scriptApi.download(script.id, `${script.name}-${script.version}`)
      notify('开始下载脚本包', 'success')
    } catch (err) {
      notify(err instanceof ApiError ? err.message : '下载失败', 'error')
    } finally {
      setDownloading(false)
    }
  }

  const install = async (): Promise<void> => {
    setInstalling(true)
    try {
      const task = await installScriptToDevice(script)
      notify(`已安装「${task.name}」，可在任务页运行`, 'success')
      onInstalled(task)
      onClose()
    } catch (err) {
      notify(err instanceof Error ? err.message : '安装失败', 'error')
    } finally {
      setInstalling(false)
    }
  }

  return (
    <Sheet
      title={script.name}
      subtitle={`v${script.version}${script.createdByName ? ` · ${script.createdByName}` : ''}`}
      onClose={onClose}
      footer={
        <div className="footer-actions">
          {native ? (
            <button
              type="button"
              className="btn btn--primary btn--block"
              onClick={() => void install()}
              disabled={installing}
            >
              {installing ? <Spinner /> : null}
              {installing ? '正在安装…' : '安装到本机（任务页运行）'}
            </button>
          ) : null}
          <button
            type="button"
            className={`btn btn--block ${native ? 'btn--ghost' : 'btn--primary'}`}
            onClick={() => void download()}
            disabled={downloading}
          >
            {downloading ? <Spinner /> : null}
            {downloading ? '下载中…' : '下载脚本 ZIP'}
          </button>
        </div>
      }
    >
      {script.description ? <p className="sheet-paragraph">{script.description}</p> : null}

      <div className="stat-row">
        <div className="stat">
          <span className="stat__value">{script.downloads ?? 0}</span>
          <span className="stat__label">下载</span>
        </div>
        <div className="stat">
          <span className="stat__value">
            {typeof script.avgRating === 'number' ? script.avgRating.toFixed(1) : '—'}
          </span>
          <span className="stat__label">评分</span>
        </div>
        <div className="stat">
          <span className="stat__value">{script.reviewCount ?? 0}</span>
          <span className="stat__label">评价</span>
        </div>
        <div className="stat">
          <span className="stat__value">{script.reviewStatus ?? '—'}</span>
          <span className="stat__label">状态</span>
        </div>
      </div>

      {Array.isArray(script.tags) && script.tags.length > 0 ? (
        <div className="tag-row">
          {script.tags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {script.entryPoint ? (
        <div className="detail-block">
          <span className="detail-block__label">入口文件</span>
          <code className="code-inline">{script.entryPoint}</code>
        </div>
      ) : null}

      {script.changelog ? (
        <div className="detail-block">
          <span className="detail-block__label">更新日志</span>
          <p className="detail-block__text">{script.changelog}</p>
        </div>
      ) : null}

      <div className="detail-block">
        <button type="button" className="collapse-trigger" onClick={() => setShowSchema((value) => !value)}>
          <span className="detail-block__label">参数 Schema</span>
          <span>{showSchema ? '收起' : '展开'}</span>
        </button>
        {showSchema ? (
          <pre className="code-block">{JSON.stringify(script.schema ?? {}, null, 2)}</pre>
        ) : null}
      </div>

      <div className="detail-block">
        <span className="detail-block__label">版本历史</span>
        {versions === null ? (
          <div className="skeleton-line" />
        ) : versions.length === 0 ? (
          <p className="muted-text">暂无版本记录</p>
        ) : (
          <ul className="version-list">
            {versions.map((version, index) => (
              <li key={`${version.version}-${index}`} className="version-item">
                <span className="version-item__tag">v{version.version}</span>
                <span className="version-item__date">{formatDate(version.createdAt)}</span>
                {version.changelog ? <p className="version-item__note">{version.changelog}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  )
}

function MarketPage({
  notify,
  online,
  banner,
  native,
  onInstalled
}: {
  notify: (text: string, type?: ToastType) => void
  online: boolean
  banner: ReactNode
  native: boolean
  onInstalled: (task: InstalledTask) => void
}): React.JSX.Element {
  const [items, setItems] = useState<ScriptItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<ScriptItem | null>(null)

  const load = useCallback(
    async (targetPage: number, append: boolean): Promise<void> => {
      if (append) setLoadingMore(true)
      else setLoading(true)
      setError('')
      try {
        const result = await scriptApi.list(targetPage, 20)
        const list = result?.items ?? []
        setItems((previous) => (append ? [...previous, ...list] : list))
        setTotal(result?.total ?? list.length)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : '加载脚本列表失败')
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    []
  )

  useEffect(() => {
    void load(1, false)
  }, [load])

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return items
    return items.filter((script) =>
      [script.name, script.description ?? '', ...(script.tags ?? [])]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    )
  }, [items, query])

  return (
    <div className="page">
      {banner}
      <div className="page-header">
        <div>
          <h1 className="page-title">脚本市场</h1>
          <p className="page-subtitle">
            共 {total} 个可见脚本{online ? '' : ' · 离线状态'}
          </p>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={() => void load(1, false)}
          aria-label="刷新"
        >
          ↻
        </button>
      </div>

      <div className="search-bar">
        <span className="search-bar__icon" aria-hidden="true">
          🔍
        </span>
        <input
          className="search-bar__input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索脚本名称、描述或标签"
          enterKeyHint="search"
        />
        {query ? (
          <button type="button" className="icon-button" onClick={() => setQuery('')} aria-label="清空">
            ✕
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="card-list">
          {[0, 1, 2].map((key) => (
            <div key={key} className="script-card script-card--skeleton">
              <div className="skeleton-line skeleton-line--wide" />
              <div className="skeleton-line" />
              <div className="skeleton-line skeleton-line--short" />
            </div>
          ))}
        </div>
      ) : error ? (
        <EmptyState icon="⚠️" title="加载失败" description={error} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="📦"
          title={query ? '没有匹配的脚本' : '市场暂无脚本'}
          description={query ? '换个关键词试试' : '开发者上传的脚本会出现在这里'}
        />
      ) : (
        <>
          <div className="card-list">
            {filtered.map((script) => (
              <ScriptCard key={script.id} script={script} onOpen={() => setSelected(script)} />
            ))}
          </div>
          {!query && items.length < total ? (
            <button
              type="button"
              className="btn btn--ghost btn--block"
              onClick={() => void load(Math.ceil(items.length / 20) + 1, true)}
              disabled={loadingMore}
            >
              {loadingMore ? <Spinner /> : null}
              {loadingMore ? '加载中…' : '加载更多'}
            </button>
          ) : null}
        </>
      )}

      {selected ? (
        <ScriptSheet
          script={selected}
          onClose={() => setSelected(null)}
          notify={notify}
          native={native}
          onInstalled={onInstalled}
        />
      ) : null}
    </div>
  )
}

/* ────────────────────────── 模板市场 ────────────────────────── */

function TemplateSheet({
  template,
  onClose
}: {
  template: TemplateItem
  onClose: () => void
}): React.JSX.Element {
  return (
    <Sheet
      title={template.name}
      subtitle={`${template.type}${template.version ? ` · v${template.version}` : ''}`}
      onClose={onClose}
    >
      {template.description ? <p className="sheet-paragraph">{template.description}</p> : null}
      <div className="detail-block">
        <span className="detail-block__label">Schema</span>
        <pre className="code-block">{JSON.stringify(template.schema ?? {}, null, 2)}</pre>
      </div>
    </Sheet>
  )
}

function ProjectTemplateSheet({
  template,
  onClose
}: {
  template: ProjectTemplateItem
  onClose: () => void
}): React.JSX.Element {
  const fields = template.fields ?? []
  return (
    <Sheet title={template.name} subtitle={template.builtIn ? '内置项目模板' : '项目模板'} onClose={onClose}>
      {template.description ? <p className="sheet-paragraph">{template.description}</p> : null}
      <div className="detail-block">
        <span className="detail-block__label">字段（{fields.length}）</span>
        {fields.length === 0 ? (
          <p className="muted-text">该模板没有自定义字段</p>
        ) : (
          <ul className="field-list">
            {fields.map((field, index) => (
              <li key={`${field.key ?? field.label ?? 'field'}-${index}`} className="field-item">
                <span className="field-item__label">{field.label ?? field.key ?? `字段 ${index + 1}`}</span>
                <span className="field-item__type">{field.type ?? 'text'}</span>
                {field.required ? <span className="pill pill--warn">必填</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  )
}

function TemplatesPage({ notify }: { notify: (text: string, type?: ToastType) => void }): React.JSX.Element {
  const [segment, setSegment] = useState<'account' | 'project'>('account')
  const [templates, setTemplates] = useState<TemplateItem[]>([])
  const [projects, setProjects] = useState<ProjectTemplateItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateItem | null>(null)
  const [selectedProject, setSelectedProject] = useState<ProjectTemplateItem | null>(null)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      const [accountResult, projectResult] = await Promise.allSettled([
        templateApi.list(1, 50),
        templateApi.projectList()
      ])
      if (accountResult.status === 'fulfilled') setTemplates(accountResult.value?.items ?? [])
      if (projectResult.status === 'fulfilled') setProjects(projectResult.value?.items ?? [])
      if (accountResult.status === 'rejected' && projectResult.status === 'rejected') {
        setError('加载模板失败，请稍后重试')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const showError = (message: string): void => notify(message, 'error')

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">模板</h1>
          <p className="page-subtitle">账户数据模板 & 项目元数据模板</p>
        </div>
        <button type="button" className="icon-button" onClick={() => void load()} aria-label="刷新">
          ↻
        </button>
      </div>

      <div className="segment" role="tablist" aria-label="模板分类">
        <button
          type="button"
          role="tab"
          aria-selected={segment === 'account'}
          className={`segment__item${segment === 'account' ? ' segment__item--active' : ''}`}
          onClick={() => setSegment('account')}
        >
          账户模板
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={segment === 'project'}
          className={`segment__item${segment === 'project' ? ' segment__item--active' : ''}`}
          onClick={() => setSegment('project')}
        >
          项目模板
        </button>
      </div>

      {loading ? (
        <div className="card-list">
          {[0, 1, 2].map((key) => (
            <div key={key} className="script-card script-card--skeleton">
              <div className="skeleton-line skeleton-line--wide" />
              <div className="skeleton-line" />
            </div>
          ))}
        </div>
      ) : error ? (
        <EmptyState icon="⚠️" title="加载失败" description={error} />
      ) : segment === 'account' ? (
        templates.length === 0 ? (
          <EmptyState icon="🧩" title="暂无账户模板" description="开发者上传的模板会出现在这里" />
        ) : (
          <div className="card-list">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                className="script-card"
                onClick={() => setSelectedTemplate(template)}
              >
                <div className="script-card__top">
                  <div className="script-card__title-line">
                    <h3 className="script-card__name">{template.name}</h3>
                    {template.version ? <span className="pill">v{template.version}</span> : null}
                  </div>
                  <span className="script-card__arrow" aria-hidden="true">
                    ›
                  </span>
                </div>
                <p className="script-card__desc">{template.description || template.type}</p>
                <div className="script-card__meta">
                  <span className="tag">{template.type}</span>
                  {template.updatedAt ? <span>{timeAgo(template.updatedAt)}</span> : null}
                </div>
              </button>
            ))}
          </div>
        )
      ) : projects.length === 0 ? (
        <EmptyState icon="🗂️" title="暂无项目模板" />
      ) : (
        <div className="card-list">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              className="script-card"
              onClick={() => setSelectedProject(project)}
            >
              <div className="script-card__top">
                <div className="script-card__title-line">
                  <h3 className="script-card__name">{project.name}</h3>
                  {project.builtIn ? <span className="pill">内置</span> : null}
                </div>
                <span className="script-card__arrow" aria-hidden="true">
                  ›
                </span>
              </div>
              <p className="script-card__desc">{project.description || '未填写描述'}</p>
              <div className="script-card__meta">
                <span>{(project.fields ?? []).length} 个字段</span>
                {project.reviewStatus && project.reviewStatus !== 'approved' ? (
                  <span className="pill pill--warn">审核中</span>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedTemplate ? (
        <TemplateSheet
          template={selectedTemplate}
          onClose={() => setSelectedTemplate(null)}
        />
      ) : null}
      {selectedProject ? (
        <ProjectTemplateSheet
          template={selectedProject}
          onClose={() => setSelectedProject(null)}
        />
      ) : null}
      {error ? (
        <button type="button" className="btn btn--ghost btn--block" onClick={() => showError(error)}>
          查看错误
        </button>
      ) : null}
    </div>
  )
}

/* ────────────────────────── 个人中心 ────────────────────────── */

/* ────────────────────────── 本机任务（Android App） ────────────────────────── */

interface SchemaProperty {
  type?: string
  title?: string
  description?: string
  default?: unknown
  enum?: unknown[]
}

/** 读取 JSON Schema 的顶层属性 */
function schemaProperties(schema: Record<string, unknown> | undefined): Array<[string, SchemaProperty]> {
  const properties =
    schema && typeof schema.properties === 'object' && schema.properties !== null
      ? (schema.properties as Record<string, SchemaProperty>)
      : {}
  return Object.entries(properties)
}

/** 由 schema 默认值 + 上次保存的配置生成初始 config */
function buildInitialConfig(task: InstalledTask): Record<string, unknown> {
  const config: Record<string, unknown> = {}
  for (const [key, prop] of schemaProperties(task.schema)) {
    if (prop.default !== undefined) config[key] = prop.default
    else if (prop.type === 'number' || prop.type === 'integer') config[key] = 0
    else if (prop.type === 'boolean') config[key] = false
    else config[key] = ''
  }
  return { ...config, ...loadTaskConfig(task.id) }
}

const TASK_STATUS_LABELS: Record<TaskRunStatus, string> = {
  idle: '未运行',
  running: '运行中',
  exited: '已结束',
  stopped: '已停止',
  error: '运行失败'
}

/** 任务参数配置弹层：按脚本 schema 生成表单，附带沙箱开关 */
function TaskConfigSheet({
  task,
  onClose,
  onStarted,
  notify
}: {
  task: InstalledTask
  onClose: () => void
  onStarted: (taskId: string) => void
  notify: (text: string, type?: ToastType) => void
}): React.JSX.Element {
  const properties = schemaProperties(task.schema)
  const [config, setConfig] = useState<Record<string, unknown>>(() => buildInitialConfig(task))
  const [sandbox, setSandbox] = useState(false)
  const [running, setRunning] = useState(false)

  const setValue = (key: string, value: unknown): void => {
    setConfig((previous) => ({ ...previous, [key]: value }))
  }

  const start = async (): Promise<void> => {
    setRunning(true)
    try {
      await runInstalledTask(task, config, sandbox)
      onStarted(task.id)
      notify(sandbox ? '已在沙箱模式启动任务' : '任务已启动', 'success')
      onClose()
    } catch (err) {
      notify(err instanceof Error ? err.message : '任务启动失败', 'error')
    } finally {
      setRunning(false)
    }
  }

  return (
    <Sheet
      title={`运行：${task.name}`}
      subtitle={`v${task.version}`}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn--primary btn--block" onClick={() => void start()} disabled={running}>
          {running ? <Spinner /> : null}
          {running ? '启动中…' : '开始运行'}
        </button>
      }
    >
      {properties.length === 0 ? (
        <p className="muted-text">该脚本没有可配置参数，点击「开始运行」即可。</p>
      ) : (
        properties.map(([key, prop]) => {
          const title = prop.title || key
          const value = config[key]
          const type = prop.type || 'string'
          if (Array.isArray(prop.enum) && prop.enum.length > 0) {
            return (
              <label key={key} className="field">
                <span className="field__label">{title}</span>
                <select
                  className="field__input"
                  value={String(value ?? '')}
                  onChange={(event) => setValue(key, event.target.value)}
                >
                  {prop.enum.map((option) => (
                    <option key={String(option)} value={String(option)}>
                      {String(option)}
                    </option>
                  ))}
                </select>
                {prop.description ? <span className="muted-text">{prop.description}</span> : null}
              </label>
            )
          }
          if (type === 'boolean') {
            return (
              <label key={key} className="checkbox-field">
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(event) => setValue(key, event.target.checked)}
                />
                <span>{title}</span>
              </label>
            )
          }
          if (type === 'number' || type === 'integer') {
            return (
              <label key={key} className="field">
                <span className="field__label">{title}</span>
                <input
                  className="field__input"
                  type="number"
                  value={value === undefined || value === null || value === '' ? '' : String(value)}
                  onChange={(event) => {
                    const raw = event.target.value
                    setValue(key, raw === '' ? '' : Number(raw))
                  }}
                />
              </label>
            )
          }
          if (type === 'object' || type === 'array') {
            return (
              <label key={key} className="field">
                <span className="field__label">{title}（JSON）</span>
                <textarea
                  className="field__input field__textarea"
                  rows={4}
                  value={typeof value === 'string' ? value : JSON.stringify(value ?? (type === 'array' ? [] : {}), null, 2)}
                  onChange={(event) => {
                    const raw = event.target.value
                    try {
                      setValue(key, JSON.parse(raw))
                    } catch {
                      setValue(key, raw)
                    }
                  }}
                />
              </label>
            )
          }
          return (
            <label key={key} className="field">
              <span className="field__label">{title}</span>
              <input
                className="field__input"
                value={value === undefined || value === null ? '' : String(value)}
                onChange={(event) => setValue(key, event.target.value)}
              />
              {prop.description ? <span className="muted-text">{prop.description}</span> : null}
            </label>
          )
        })
      )}

      <label className="checkbox-field">
        <input type="checkbox" checked={sandbox} onChange={(event) => setSandbox(event.target.checked)} />
        <span>
          沙箱模式
          <span className="muted-text">（拒绝网络与文件系统权限，适合不信任的脚本）</span>
        </span>
      </label>

      <p className="muted-text">
        脚本在本机内嵌 Node.js 运行时中执行；声明的权限：{task.permissions && task.permissions.length > 0 ? task.permissions.join('、') : '无'}。
        依赖 npm 包的脚本需开发者自行打包进 zip。
      </p>
    </Sheet>
  )
}

/** 本机任务页：安装的脚本列表、运行/停止、日志 */
function TasksPage({
  notify,
  goMarket
}: {
  notify: (text: string, type?: ToastType) => void
  goMarket: () => void
}): React.JSX.Element {
  const [tasks, setTasks] = useState<InstalledTask[]>([])
  const [statuses, setStatuses] = useState<Record<string, TaskRunStatus>>({})
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [logs, setLogs] = useState<Record<string, TaskLogEntry[]>>({})
  const [loading, setLoading] = useState(true)
  const [runtime, setRuntime] = useState<RuntimePing | null>(null)
  const [runtimeError, setRuntimeError] = useState('')
  const [configTask, setConfigTask] = useState<InstalledTask | null>(null)
  const [logTask, setLogTask] = useState<InstalledTask | null>(null)
  const logEndRef = useRef<HTMLDivElement | null>(null)

  const loadTasks = useCallback(async (): Promise<void> => {
    setTasks(listInstalledTasks())
    try {
      const [runtimeInfo, runtimeTasks] = await Promise.all([pingNodeRuntime(), syncTasksFromRuntime()])
      setRuntime(runtimeInfo)
      setRuntimeError('')
      setTasks(runtimeTasks)
    } catch (err) {
      setRuntimeError(err instanceof Error ? err.message : 'Node 运行时不可用')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  useEffect(() => {
    return onNodeEvent((eventName, payload) => {
      const data = payload as Record<string, unknown> | null
      if (!data || typeof data.taskId !== 'string') return
      const taskId = data.taskId
      if (eventName === 'task-status') {
        setStatuses((previous) => ({ ...previous, [taskId]: (data.status as TaskRunStatus) || 'idle' }))
        if (data.status === 'exited' || data.status === 'stopped' || data.status === 'error') {
          setProgress((previous) => ({ ...previous, [taskId]: 0 }))
        }
      } else if (eventName === 'task-log') {
        const entry = data as unknown as TaskLogEntry
        setLogs((previous) => {
          const list = [...(previous[taskId] || []), entry]
          if (list.length > 500) list.splice(0, list.length - 500)
          return { ...previous, [taskId]: list }
        })
      } else if (eventName === 'task-progress') {
        setProgress((previous) => ({
          ...previous,
          [taskId]: Math.max(0, Math.min(100, Number(data.percent) || 0))
        }))
      }
    })
  }, [])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: 'end' })
  }, [logs, logTask])

  const stopTask = async (task: InstalledTask): Promise<void> => {
    try {
      await stopInstalledTask(task.id)
      notify('已请求停止任务', 'info')
    } catch (err) {
      notify(err instanceof Error ? err.message : '停止失败', 'error')
    }
  }

  const removeTask = async (task: InstalledTask): Promise<void> => {
    if (!window.confirm(`删除任务「${task.name}」？脚本文件也会从手机删除。`)) return
    try {
      await deleteInstalledTask(task.id)
      setTasks(listInstalledTasks())
      notify('任务已删除', 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : '删除失败', 'error')
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">任务</h1>
          <p className="page-subtitle">本机脚本执行（内嵌 Node.js 运行时）</p>
        </div>
        <button type="button" className="icon-button" onClick={() => void loadTasks()} aria-label="刷新">
          ↻
        </button>
      </div>

      {runtime ? (
        <div className="runtime-banner">
          <span className="runtime-banner__dot" aria-hidden="true" />
          <div className="runtime-banner__text">
            <strong>
              Node.js {runtime.node} · {runtime.workerSupported ? 'Worker 隔离运行' : '主运行时模式'}
            </strong>
            <span>
              {runtime.enforcerPresent ? '沙箱权限控制已启用' : '缺少权限控制文件'} · {runtime.arch} · 脚本保存在手机应用私有目录
            </span>
          </div>
        </div>
      ) : runtimeError ? (
        <div className="runtime-banner runtime-banner--error">
          <span aria-hidden="true">⚠️</span>
          <div className="runtime-banner__text">
            <strong>Node 运行时未就绪</strong>
            <span>{runtimeError}</span>
          </div>
          <button type="button" className="btn btn--small btn--ghost" onClick={() => void loadTasks()}>
            重试
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="card-list">
          {[0, 1].map((key) => (
            <div key={key} className="script-card script-card--skeleton">
              <div className="skeleton-line skeleton-line--wide" />
              <div className="skeleton-line" />
            </div>
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">🤖</div>
          <p className="empty-state__title">还没有安装脚本</p>
          <p className="empty-state__desc">去脚本市场选择脚本，点「安装到手机并运行」</p>
          <button type="button" className="btn btn--primary" onClick={goMarket}>
            去脚本市场
          </button>
        </div>
      ) : (
        <div className="card-list">
          {tasks.map((task) => {
            const status = statuses[task.id] || 'idle'
            const percent = progress[task.id] || 0
            return (
              <div key={task.id} className="task-card">
                <div className="task-card__header">
                  <div>
                    <h3 className="script-card__name">{task.name}</h3>
                    <p className="muted-text">
                      v{task.version} · {task.entryPoint}
                    </p>
                  </div>
                  <span
                    className={`task-status task-status--${status}`}
                  >
                    {TASK_STATUS_LABELS[status] || status}
                  </span>
                </div>
                {status === 'running' ? (
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${percent}%` }} />
                  </div>
                ) : null}
                <div className="task-card__actions">
                  {status === 'running' ? (
                    <button type="button" className="btn btn--small btn--danger" onClick={() => void stopTask(task)}>
                      停止
                    </button>
                  ) : (
                    <button type="button" className="btn btn--small btn--primary" onClick={() => setConfigTask(task)}>
                      运行
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn--small btn--ghost"
                    onClick={() => setLogTask(task)}
                  >
                    日志 {logs[task.id] ? `(${logs[task.id].length})` : ''}
                  </button>
                  <button
                    type="button"
                    className="btn btn--small btn--ghost"
                    onClick={() => void removeTask(task)}
                  >
                    删除
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {configTask ? (
        <TaskConfigSheet
          task={configTask}
          onClose={() => setConfigTask(null)}
          onStarted={(taskId) => {
            setStatuses((previous) => ({ ...previous, [taskId]: 'running' }))
          }}
          notify={notify}
        />
      ) : null}

      {logTask ? (
        <Sheet
          title={`日志：${logTask.name}`}
          onClose={() => setLogTask(null)}
          footer={
            <button
              type="button"
              className="btn btn--ghost btn--block"
              onClick={() => setLogs((previous) => ({ ...previous, [logTask.id]: [] }))}
            >
              清空日志
            </button>
          }
        >
          {logs[logTask.id] && logs[logTask.id].length > 0 ? (
            <div className="task-log">
              {logs[logTask.id].map((entry, index) => (
                <div key={`${entry.timestamp}-${index}`} className={`task-log__line task-log__line--${entry.level}`}>
                  <span className="task-log__time">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                  <span className="task-log__level">{entry.level.toUpperCase()}</span>
                  <span className="task-log__message">{entry.message}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          ) : (
            <p className="muted-text">暂无日志。运行任务后日志会实时显示在这里。</p>
          )}
        </Sheet>
      ) : null}
    </div>
  )
}

function ProfilePage({
  user,
  health,
  onUserChange,
  onLogout,
  notify
}: {
  user: User
  health: HealthInfo | null
  onUserChange: (user: User) => void
  onLogout: () => void
  notify: (text: string, type?: ToastType) => void
}): React.JSX.Element {
  const [displayName, setDisplayName] = useState(user.displayName || '')
  const [savingName, setSavingName] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  const [generatingKey, setGeneratingKey] = useState(false)
  const [newApiKey, setNewApiKey] = useState('')

  useEffect(() => {
    setDisplayName(user.displayName || '')
  }, [user.displayName])

  const saveDisplayName = async (): Promise<void> => {
    const value = displayName.trim()
    if (!value) {
      notify('显示名称不能为空', 'error')
      return
    }
    if (value === user.displayName) {
      notify('显示名称未变化', 'info')
      return
    }
    setSavingName(true)
    try {
      const updated = await userApi.updateMe({ displayName: value })
      onUserChange(updated)
      notify('显示名称已更新', 'success')
    } catch (err) {
      notify(err instanceof ApiError ? err.message : '更新失败', 'error')
    } finally {
      setSavingName(false)
    }
  }

  const savePassword = async (): Promise<void> => {
    if (!currentPassword) {
      notify('请输入当前密码', 'error')
      return
    }
    if (newPassword.length < 8) {
      notify('新密码至少需要 8 个字符', 'error')
      return
    }
    if (newPassword !== confirmPassword) {
      notify('两次输入的新密码不一致', 'error')
      return
    }
    setSavingPassword(true)
    try {
      await userApi.updateMe({ currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      notify('密码修改成功', 'success')
    } catch (err) {
      notify(err instanceof ApiError ? err.message : '密码修改失败', 'error')
    } finally {
      setSavingPassword(false)
    }
  }

  const regenerate = async (): Promise<void> => {
    setGeneratingKey(true)
    try {
      const result = await userApi.regenerateKey()
      setNewApiKey(result.apiKey)
      onUserChange({ ...user, apiKeySet: true })
      notify('新 API Key 已生成，仅显示这一次', 'success')
    } catch (err) {
      notify(err instanceof ApiError ? err.message : '生成 API Key 失败', 'error')
    } finally {
      setGeneratingKey(false)
    }
  }

  return (
    <div className="page">
      <div className="profile-hero">
        <div className="profile-avatar" aria-hidden="true">
          {(user.displayName || user.username).slice(0, 1).toUpperCase()}
        </div>
        <div className="profile-hero__info">
          <h1 className="profile-name">{user.displayName || user.username}</h1>
          <p className="profile-username">@{user.username}</p>
          <span className={`role-pill role-pill--${user.role}`}>{roleLabel(user.role)}</span>
        </div>
      </div>

      <section className="section-card">
        <h2 className="section-title">账户</h2>
        <label className="field">
          <span className="field__label">显示名称</span>
          <div className="field__row">
            <input
              className="field__input"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="显示名称"
            />
            <button
              type="button"
              className="btn btn--small btn--primary"
              onClick={() => void saveDisplayName()}
              disabled={savingName}
            >
              {savingName ? <Spinner size={14} /> : null}
              保存
            </button>
          </div>
        </label>
      </section>

      <section className="section-card">
        <h2 className="section-title">修改密码</h2>
        <label className="field">
          <span className="field__label">当前密码</span>
          <input
            className="field__input"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            placeholder="当前密码"
          />
        </label>
        <label className="field">
          <span className="field__label">新密码（至少 8 位）</span>
          <input
            className="field__input"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            placeholder="新密码"
          />
        </label>
        <label className="field">
          <span className="field__label">确认新密码</span>
          <input
            className="field__input"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            placeholder="再次输入新密码"
          />
        </label>
        <button
          type="button"
          className="btn btn--primary btn--block"
          onClick={() => void savePassword()}
          disabled={savingPassword}
        >
          {savingPassword ? <Spinner /> : null}
          修改密码
        </button>
      </section>

      <section className="section-card">
        <h2 className="section-title">API Key</h2>
        <p className="muted-text">
          用于脚本/自动化工具直连市场服务端。重新生成后旧 Key 立即失效，新 Key 仅显示一次。
        </p>
        <button
          type="button"
          className="btn btn--ghost btn--block"
          onClick={() => void regenerate()}
          disabled={generatingKey}
        >
          {generatingKey ? <Spinner /> : null}
          重新生成 API Key
        </button>
      </section>

      <section className="section-card">
        <h2 className="section-title">关于</h2>
        <dl className="info-list">
          <div className="info-list__row">
            <dt>服务端</dt>
            <dd className="mono">{window.location.origin}</dd>
          </div>
          <div className="info-list__row">
            <dt>服务状态</dt>
            <dd>
              {health ? (
                <span className={health.db === 'connected' ? 'text-success' : 'text-danger'}>
                  {health.db === 'connected' ? '正常' : '异常'}
                </span>
              ) : (
                '未知'
              )}
            </dd>
          </div>
          <div className="info-list__row">
            <dt>客户端</dt>
            <dd>TaskForge Mobile PWA v1.0.0</dd>
          </div>
        </dl>
      </section>

      <button type="button" className="btn btn--danger btn--block" onClick={onLogout}>
        退出登录
      </button>

      {newApiKey ? (
        <Sheet
          title="新的 API Key"
          subtitle="请立即复制保存，关闭后无法再次查看"
          onClose={() => setNewApiKey('')}
          footer={
            <button
              type="button"
              className="btn btn--primary btn--block"
              onClick={() => {
                void copyText(newApiKey).then((ok) =>
                  notify(ok ? '已复制到剪贴板' : '复制失败，请手动选择复制', ok ? 'success' : 'error')
                )
              }}
            >
              复制 API Key
            </button>
          }
        >
          <code className="api-key-box">{newApiKey}</code>
        </Sheet>
      ) : null}
    </div>
  )
}

/* ────────────────────────── 底部导航图标 ────────────────────────── */

function TabIcon({ tab, active }: { tab: Tab; active: boolean }): React.JSX.Element {
  const stroke = active ? 'currentColor' : 'currentColor'
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true
  }
  if (tab === 'market') {
    return (
      <svg {...common}>
        <path d="M4 10h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
        <path d="M4 10l2-5h12l2 5" />
        <path d="M9 14h6" />
      </svg>
    )
  }
  if (tab === 'templates') {
    return (
      <svg {...common}>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M4 10h16M10 10v10" />
      </svg>
    )
  }
  if (tab === 'tasks') {
    return (
      <svg {...common}>
        <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
        <path d="M8 3v4M16 3v4M3.5 10h17" />
        <path d="M8 14l2 2 4-4" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  )
}

/* ────────────────────────── 应用根组件 ────────────────────────── */

export default function App(): React.JSX.Element {
  const [user, setUser] = useState<User | null>(() => (getToken() ? getCachedUser() : null))
  const [health, setHealth] = useState<HealthInfo | null>(null)
  const [tab, setTab] = useState<Tab>('market')
  const [toast, setToast] = useState<ToastState | null>(null)
  const [online, setOnline] = useState<boolean>(() => navigator.onLine)
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [showInstall, setShowInstall] = useState(true)
  const toastTimer = useRef<number | null>(null)

  const notify = useCallback((text: string, type: ToastType = 'info'): void => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    setToast({ text, type })
    toastTimer.current = window.setTimeout(() => setToast(null), 3200)
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    authApi
      .health()
      .then((info) => {
        if (!cancelled) setHealth(info)
      })
      .catch(() => {
        if (!cancelled) setHealth(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const handleUnauthorized = (): void => {
      setUser(null)
      notify('登录已失效，请重新登录', 'error')
    }
    const handleOnline = (): void => setOnline(true)
    const handleOffline = (): void => setOnline(false)
    const handleInstallPrompt = (event: Event): void => {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
    }
    window.addEventListener('tf:unauthorized', handleUnauthorized)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('beforeinstallprompt', handleInstallPrompt)
    return () => {
      window.removeEventListener('tf:unauthorized', handleUnauthorized)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
    }
  }, [notify])

  const handleAuthed = useCallback((nextUser: User, token: string): void => {
    setToken(token)
    setCachedUser(nextUser)
    setUser(nextUser)
    setTab('market')
  }, [])

  const handleUserChange = useCallback((nextUser: User): void => {
    setCachedUser(nextUser)
    setUser(nextUser)
  }, [])

  const handleLogout = useCallback((): void => {
    setToken(null)
    setCachedUser(null)
    setUser(null)
    setTab('market')
    notify('已退出登录', 'info')
  }, [notify])

  if (!user) {
    return <AuthScreen health={health} onAuthed={handleAuthed} notify={notify} />
  }

  const banner =
    !isNativeApp && showInstall && !isStandalone() ? (
      <InstallBanner
        event={installEvent}
        onDismiss={() => setShowInstall(false)}
        onInstalled={() => setShowInstall(false)}
      />
    ) : null

  return (
    <div className="app-shell">
      {toast ? (
        <div className={`toast toast--${toast.type}`} role="status">
          {toast.text}
        </div>
      ) : null}

      {!online ? <div className="offline-banner">当前离线，部分功能不可用</div> : null}

      <header className="app-header">
        <div className="app-header__brand">
          <img src={`${ICON_BASE}icon-192.png`} alt="" className="app-header__logo" />
          <div>
            <span className="app-header__name">TASKFORGE</span>
            <span className="app-header__sub">{isNativeApp ? 'Android App' : '移动端'}</span>
          </div>
        </div>
        <span className={`role-pill role-pill--${user.role}`}>{roleLabel(user.role)}</span>
      </header>

      <main className="app-main">
        {tab === 'market' ? (
          <MarketPage
            notify={notify}
            online={online}
            banner={banner}
            native={isNativeApp}
            onInstalled={() => setTab('tasks')}
          />
        ) : tab === 'templates' ? (
          <TemplatesPage notify={notify} />
        ) : tab === 'tasks' ? (
          <TasksPage notify={notify} goMarket={() => setTab('market')} />
        ) : (
          <ProfilePage
            user={user}
            health={health}
            onUserChange={handleUserChange}
            onLogout={handleLogout}
            notify={notify}
          />
        )}
      </main>

      <nav className="tab-bar" aria-label="主导航">
        {(
          [
            { key: 'market' as Tab, label: '市场' },
            { key: 'templates' as Tab, label: '模板' },
            ...(isNativeApp ? [{ key: 'tasks' as Tab, label: '任务' }] : []),
            { key: 'profile' as Tab, label: '我的' }
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            className={`tab-bar__item${tab === item.key ? ' tab-bar__item--active' : ''}`}
            onClick={() => setTab(item.key)}
            aria-current={tab === item.key ? 'page' : undefined}
          >
            <TabIcon tab={item.key} active={tab === item.key} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

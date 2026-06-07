/**
 * @file ScriptDetail — 脚本详情页
 * @description 从 Marketplace 列表点击脚本卡片进入，展示脚本元数据、版本、changelog、关联任务。
 *              支持安装/创建任务操作，4 个 Tab 切换查看不同维度的信息。
 * @module renderer/pages
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { marketplaceApi, scriptApi, taskApi, fileApi } from '../api'
import type { RemoteScript, InstalledScript, Task, ScriptReview, RatingStats } from '../types'
import type { PermissionSet } from '../../../shared/types'
import {
  ArrowLeft,
  Download,
  FileText,
  Shield,
  Terminal,
  History,
  Play,
  BookOpen,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  User,
  Tag,
  Hash,
  Star,
  MessageSquare,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import MarkdownView from '../components/MarkdownView'

/** 标签页类型 */
type TabKey = 'overview' | 'version' | 'tasks' | 'readme' | 'ratings'

/** Tab 配置项 */
interface TabItem {
  key: TabKey
  label: string
  icon: React.ReactNode
}

const TABS: TabItem[] = [
  { key: 'overview', label: '概述', icon: <FileText size={14} /> },
  { key: 'version', label: '版本', icon: <History size={14} /> },
  { key: 'tasks', label: '我运行过的', icon: <Play size={14} /> },
  { key: 'readme', label: 'README', icon: <BookOpen size={14} /> },
  { key: 'ratings', label: '评分', icon: <Star size={14} /> }
]

/** 加载中状态组件 */
function LoadingView(): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      <p className="text-text-muted text-sm">加载脚本详情...</p>
    </div>
  )
}

/** 错误状态组件 */
function ErrorView({
  message,
  onRetry
}: {
  message: string
  onRetry: () => void
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <AlertTriangle className="w-12 h-12 text-danger" />
      <p className="text-danger text-sm">{message}</p>
      <button
        onClick={onRetry}
        className="flex items-center gap-1.5 px-4 py-2 bg-bg-card border border-border-light rounded-lg hover:border-primary/50 transition-all text-sm"
      >
        <RefreshCw size={14} />重试
      </button>
    </div>
  )
}

/** 404 状态组件 */
function NotFoundView(): React.ReactElement {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <FileText className="w-12 h-12 text-text-muted" />
      <p className="text-text-muted">脚本不存在或已被删除</p>
      <button
        onClick={() => navigate('/marketplace')}
        className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors text-sm"
      >
        <ArrowLeft size={14} />返回市场
      </button>
    </div>
  )
}

/** 脚本的状态标签组件 */
function StatusBadge({
  installed,
  remoteVersion,
  installedVersion
}: {
  installed: boolean
  remoteVersion: string
  installedVersion?: string
}): React.ReactElement {
  if (!installed) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-text-muted/10 text-text-muted">
        未安装
      </span>
    )
  }
  const canUpdate =
    installedVersion && remoteVersion && installedVersion !== remoteVersion
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full ${
        canUpdate ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'
      }`}
    >
      {canUpdate ? '可更新' : '已安装'}
    </span>
  )
}

/** 权限标签组件 */
function PermissionBadge({
  granted
}: {
  granted: boolean
}): React.ReactElement {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${
        granted ? 'bg-success/10 text-success' : 'bg-text-muted/10 text-text-muted'
      }`}
    >
      <Shield size={10} />
      {granted ? '已授权' : '未授权'}
    </span>
  )
}

/** 任务状态标签组件 */
function TaskStatusBadge({
  status
}: {
  status: Task['status']
}): React.ReactElement {
  const config: Record<string, { label: string; className: string }> = {
    idle: { label: '空闲', className: 'bg-text-muted/10 text-text-muted' },
    running: { label: '运行中', className: 'bg-info/10 text-info' },
    paused: { label: '已暂停', className: 'bg-warning/10 text-warning' },
    stopped: { label: '已停止', className: 'bg-text-muted/10 text-text-muted' },
    complete: { label: '已完成', className: 'bg-success/10 text-success' },
    error: { label: '错误', className: 'bg-danger/10 text-danger' }
  }
  const c = config[status] ?? {
    label: status,
    className: 'bg-text-muted/10 text-text-muted'
  }
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${c.className}`}>
      {c.label}
    </span>
  )
}

/**
 * ScriptDetailPage — 脚本详情页面组件
 *
 * 从 URL 参数获取 scriptId，调用 marketplaceApi.listScripts() 过滤得到脚本详情。
 * 同时检查本地安装状态，展示 4 个维度的信息标签页。
 */
export default function ScriptDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const scriptId = id ?? ''

  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [script, setScript] = useState<RemoteScript | null>(null)
  const [installed, setInstalled] = useState<InstalledScript | null>(null)
  const [relatedTasks, setRelatedTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [installing, setInstalling] = useState(false)

  /** 拉取脚本详情、安装状态、关联任务 */
  const fetchData = useCallback(async () => {
    if (!scriptId) return
    setLoading(true)
    setError(null)
    setNotFound(false)
    try {
      const [remoteList, installedList] = await Promise.all([
        marketplaceApi.listScripts(),
        scriptApi.listInstalled()
      ])
      const found = remoteList.items.find((s) => s.id === scriptId)
      if (!found) {
        setNotFound(true)
        return
      }
      setScript(found)

      const inst = installedList.find((s) => s.id === scriptId) ?? null
      setInstalled(inst)

      if (inst) {
        const tasks = await taskApi.list(1, 200)
        const filtered = tasks.items.filter(
          (t) => t.scriptFolder?.includes(scriptId)
        )
        setRelatedTasks(filtered)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [scriptId])

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchData()
  }, [fetchData])
  /* eslint-enable react-hooks/set-state-in-effect */

  /** 安装脚本 */
  const handleInstall = async () => {
    setInstalling(true)
    try {
      const result = await scriptApi.download(scriptId)
      setInstalled(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : '安装失败')
    } finally {
      setInstalling(false)
    }
  }

  /** 导航到任务创建页 */
  const handleCreateTask = () => {
    navigate('/tasks?script=' + scriptId)
  }

  if (loading) return <LoadingView />
  if (notFound) return <NotFoundView />
  if (error)
    return <ErrorView message={error} onRetry={fetchData} />
  if (!script) return <NotFoundView />

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/marketplace')}
            className="p-2 rounded-lg hover:bg-bg-tertiary transition-colors text-text-secondary hover:text-text-primary shrink-0"
            title="返回市场"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-text-primary truncate">
                {script.name}
              </h1>
              <span className="text-sm font-mono text-text-muted bg-bg-tertiary px-2 py-0.5 rounded shrink-0">
                v{script.version}
              </span>
              <StatusBadge
                installed={!!installed}
                remoteVersion={script.version}
                installedVersion={installed?.version}
              />
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
              {script.createdByName && (
                <span className="flex items-center gap-1">
                  <User size={10} />
                  {script.createdByName}
                </span>
              )}
              {script.tags?.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-bg-tertiary"
                >
                  <Tag size={10} />
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {installed ? (
            <>
              <span className="flex items-center gap-1 text-xs text-success">
                <CheckCircle2 size={14} />已安装
              </span>
              <button
                onClick={handleCreateTask}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors text-sm font-medium"
              >
                <Play size={14} />创建任务
              </button>
            </>
          ) : (
            <button
              onClick={handleInstall}
              disabled={installing}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors text-sm font-medium"
            >
              <Download size={14} />
              {installing ? '安装中...' : '安装'}
            </button>
          )}
        </div>
      </div>

      {/* 信息卡 */}
      <div className="flex items-center gap-4 flex-wrap text-sm text-text-muted bg-bg-card rounded-xl border border-border-light px-4 py-3">
        <span className="flex items-center gap-1">
          <Download size={12} />
          下载 {script.downloads ?? 0} 次
        </span>
        <span className="flex items-center gap-1">
          <Clock size={12} />
          更新于 {new Date(script.updatedAt).toLocaleDateString('zh-CN')}
        </span>
        {installed && (
          <span className="flex items-center gap-1">
            <Terminal size={12} />
            安装路径: {installed.installPath}
          </span>
        )}
      </div>

      {/* Tab 切换器 */}
      <div className="flex bg-bg-tertiary rounded-lg p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-primary text-white'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 内容区 */}
      <div className="bg-bg-card rounded-xl border border-border-light p-5">
        {activeTab === 'overview' && (
          <OverviewTab script={script} installed={installed} />
        )}
        {activeTab === 'version' && <VersionTab script={script} />}
        {activeTab === 'tasks' && (
          <TasksTab
            tasks={relatedTasks}
            installed={installed}
            scriptName={script.name}
          />
        )}
        {activeTab === 'readme' && <ReadmeTab script={script} installed={installed} />}
        {activeTab === 'ratings' && <RatingsTab scriptId={scriptId} />}
      </div>
    </div>
  )
}

/* ================================================================
 * Tab 子组件
 * ================================================================ */

/** Tab 1: 概述 — 描述、所需账户模板、所需权限、entryPoint、runtime */
function OverviewTab({
  script,
  installed
}: {
  script: RemoteScript
  installed: InstalledScript | null
}): React.ReactElement {
  const perms: PermissionSet = installed?.permissions ?? { network: false, filesystem: false }
  const entryPoint = script.entryPoint || installed?.entryPoint

  return (
    <div className="space-y-5">
      {/* 描述 */}
      <Section title="描述" icon={<FileText size={14} />}>
        <p className="text-sm text-text-secondary whitespace-pre-wrap">
          {script.description || '暂无描述'}
        </p>
      </Section>

      {/* 所需权限 */}
      <Section title="所需权限" icon={<Shield size={14} />}>
        <div className="flex items-center gap-4 flex-wrap">
          <PermissionBadge granted={perms.network} />
          <PermissionBadge granted={perms.filesystem} />
        </div>
        <p className="text-xs text-text-muted mt-2">
          网络权限（network）：允许脚本发起网络请求；文件系统权限（filesystem）：允许脚本读写脚本目录外的文件系统
        </p>
      </Section>

      {/* 入口文件 / 运行时 */}
      <Section title="技术信息" icon={<Terminal size={14} />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <InfoRow label="入口文件" value={entryPoint || '未知'} />
          <InfoRow label="运行时" value="Node.js" />
          <InfoRow label="脚本 ID" value={script.id} mono />
          {script.checksum && (
            <InfoRow label="校验和" value={script.checksum} mono />
          )}
        </div>
      </Section>

      {/* 所需账户模板 */}
      {installed && (
        <Section title="关联信息" icon={<Hash size={14} />}>
          <InfoRow label="安装路径" value={installed.installPath} mono />
          <InfoRow label="已安装版本" value={installed.version} />
          <InfoRow
            label="安装时间"
            value={new Date(installed.downloadedAt).toLocaleString('zh-CN')}
          />
        </Section>
      )}
    </div>
  )
}

/** Tab 2: 版本 — 展示当前版本和 changelog（无版本历史 API 时简化为单版本） */
function VersionTab({
  script
}: {
  script: RemoteScript
}): React.ReactElement {
  return (
    <div className="space-y-5">
      <Section title="当前版本" icon={<Tag size={14} />}>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-lg font-bold text-text-primary">
            v{script.version}
          </span>
          <span className="text-xs text-text-muted">
            {new Date(script.updatedAt).toLocaleString('zh-CN')}
          </span>
        </div>
      </Section>

      {script.changelog ? (
        <Section title="更新日志" icon={<History size={14} />}>
          <pre className="text-sm text-text-secondary whitespace-pre-wrap font-sans leading-relaxed">
            {script.changelog}
          </pre>
        </Section>
      ) : (
        <div className="flex flex-col items-center justify-center py-10 gap-2 text-text-muted">
          <History size={24} />
          <p className="text-sm">暂无版本更新日志</p>
        </div>
      )}

      <div className="bg-bg-tertiary rounded-lg p-3 text-xs text-text-muted">
        版本历史功能需要 Marketplace Server 支持版本管理 API，当前仅显示最新版本。
      </div>
    </div>
  )
}

/** Tab 3: 我运行过的 — 展示关联的任务列表 */
function TasksTab({
  tasks,
  installed,
  scriptName
}: {
  tasks: Task[]
  installed: InstalledScript | null
  scriptName: string
}): React.ReactElement {
  if (!installed) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-text-muted">
        <Play size={40} />
        <p className="text-sm">请先安装脚本以查看关联任务</p>
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-text-muted">
        <Play size={40} />
        <p className="text-sm">暂无 {scriptName} 的运行记录</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">
        共 {tasks.length} 个关联任务
      </p>
      <div className="space-y-2">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="flex items-center justify-between p-3 rounded-lg border border-border-light hover:border-primary/30 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text-primary truncate">
                  {task.id.slice(0, 8)}...
                </span>
                <TaskStatusBadge status={task.status} />
                {task.isSandbox && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-warning/10 text-warning flex items-center gap-0.5">
                    <Shield size={10} />沙箱
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
                {task.startedAt && (
                  <span>
                    开始: {new Date(task.startedAt).toLocaleString('zh-CN')}
                  </span>
                )}
                {task.endedAt && (
                  <span>
                    结束: {new Date(task.endedAt).toLocaleString('zh-CN')}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Tab 4: README — 渲染脚本 README 内容 */
function ReadmeTab({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  script: _script,
  installed
}: {
  script: RemoteScript
  installed: InstalledScript | null
}): React.ReactElement {
  const [readmeContent, setReadmeContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!installed) return

    const loadReadme = async () => {
      setLoading(true)
      setError(null)
      try {
        const readmePath = `${installed.installPath}/README.md`
        const result = await fileApi.readFile(readmePath)
        if (result.success && result.content) {
          setReadmeContent(result.content)
        } else {
          setReadmeContent(null)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载 README 失败')
        setReadmeContent(null)
      } finally {
        setLoading(false)
      }
    }

    loadReadme()
  }, [installed])

  // Not installed
  if (!installed) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-text-muted">
        <BookOpen size={40} />
        <p className="text-sm">暂无 README</p>
        <p className="text-xs text-text-muted/60">
          安装脚本后查看 README
        </p>
      </div>
    )
  }

  // Loading
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <p className="text-text-muted text-sm">加载 README...</p>
      </div>
    )
  }

  // Error
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-text-muted">
        <AlertTriangle size={40} className="text-danger" />
        <p className="text-sm text-danger">README 加载失败</p>
        <p className="text-xs text-text-muted/60 break-all">{error}</p>
      </div>
    )
  }

  // No README file
  if (!readmeContent) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-text-muted">
        <BookOpen size={40} />
        <p className="text-sm">暂无 README</p>
        <p className="text-xs text-text-muted/60">
          该脚本未包含 README 文件
        </p>
      </div>
    )
  }

  // Render README
  return <MarkdownView content={readmeContent} />
}

/* ================================================================
 * Tab 5: 评分 — 评分概览 + 分布 + 写/编辑评分 + 评分列表
 * ================================================================ */

/** 渲染 5 星评分组件 */
function StarRating({
  rating,
  size = 18,
  interactive = false,
  onChange
}: {
  rating: number
  size?: number
  interactive?: boolean
  onChange?: (r: number) => void
}): React.ReactElement {
  const stars = []
  for (let i = 1; i <= 5; i++) {
    const filled = i <= Math.floor(rating)
    const half = !filled && i === Math.ceil(rating) && rating % 1 >= 0.25 && rating % 1 < 0.75
    stars.push(
      <button
        key={i}
        type="button"
        disabled={!interactive}
        onClick={() => interactive && onChange?.(i)}
        className={`${interactive ? 'cursor-pointer hover:scale-110' : 'cursor-default'} transition-transform`}
        title={interactive ? `${i} 星` : undefined}
      >
        <Star
          size={size}
          className={
            filled
              ? 'text-warning fill-warning'
              : half
                ? 'text-warning fill-warning/50'
                : 'text-text-muted/30'
          }
        />
      </button>
    )
  }
  return <div className="flex items-center gap-0.5">{stars}</div>
}

/** 评分概览 + 分布 + 写/编辑评分 + 评分列表 */
function RatingsTab({
  scriptId
}: {
  scriptId: string
}): React.ReactElement {
  const [stats, setStats] = useState<RatingStats | null>(null)
  const [myReview, setMyReview] = useState<ScriptReview | null>(null)
  const [reviews, setReviews] = useState<ScriptReview[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 评分表单状态
  const [myRating, setMyRating] = useState(0)
  const [myComment, setMyComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editing, setEditing] = useState(false)

  const pageSize = 10

  const fetchData = useCallback(async () => {
    if (!scriptId) return
    setLoading(true)
    setError(null)
    try {
      const [s, r, mr] = await Promise.all([
        marketplaceApi.getRatingStats(scriptId),
        marketplaceApi.getReviews(scriptId, page, pageSize),
        marketplaceApi.getMyReview(scriptId).catch(() => null)
      ])
      setStats(s)
      setReviews(r.items as unknown as ScriptReview[])
      setTotal(r.total)
      setTotalPages(r.totalPages)
      if (mr) {
        setMyReview(mr as unknown as ScriptReview)
        setMyRating((mr as unknown as ScriptReview).rating)
        setMyComment((mr as unknown as ScriptReview).comment || '')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [scriptId, page])

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchData()
  }, [fetchData])
  /* eslint-enable react-hooks/set-state-in-effect */

  /** 提交评分 */
  const handleSubmit = async () => {
    if (myRating < 1 || myRating > 5) return
    setSubmitting(true)
    try {
      const result = await marketplaceApi.submitReview(scriptId, {
        rating: myRating,
        comment: myComment.trim() || undefined
      })
      setMyReview(result as unknown as ScriptReview)
      setEditing(false)
      // 刷新统计和列表
      const [s, r] = await Promise.all([
        marketplaceApi.getRatingStats(scriptId),
        marketplaceApi.getReviews(scriptId, 1, pageSize)
      ])
      setStats(s)
      setReviews(r.items as unknown as ScriptReview[])
      setTotal(r.total)
      setTotalPages(r.totalPages)
      setPage(1)
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  /** 删除评分 */
  const handleDelete = async () => {
    try {
      await marketplaceApi.deleteMyReview(scriptId)
      setMyReview(null)
      setMyRating(0)
      setMyComment('')
      setEditing(false)
      const [s, r] = await Promise.all([
        marketplaceApi.getRatingStats(scriptId),
        marketplaceApi.getReviews(scriptId, page, pageSize)
      ])
      setStats(s)
      setReviews(r.items as unknown as ScriptReview[])
      setTotal(r.total)
      setTotalPages(r.totalPages)
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    }
  }

  if (loading) return <LoadingView />
  if (error)
    return <ErrorView message={error} onRetry={fetchData} />

  const distribution = stats?.distribution ?? { stars5: 0, stars4: 0, stars3: 0, stars2: 0, stars1: 0 }
  const totalCount = stats?.count ?? 0
  const distEntries = [
    { stars: 5, count: distribution.stars5 },
    { stars: 4, count: distribution.stars4 },
    { stars: 3, count: distribution.stars3 },
    { stars: 2, count: distribution.stars2 },
    { stars: 1, count: distribution.stars1 }
  ]

  return (
    <div className="space-y-6">
      {/* 评分概览 */}
      <div className="flex items-start gap-6">
        <div className="flex flex-col items-center shrink-0">
          <span className="text-4xl font-bold text-text-primary">
            {(stats?.avgRating ?? 0).toFixed(1)}
          </span>
          <StarRating rating={stats?.avgRating ?? 0} size={14} />
          <span className="text-xs text-text-muted mt-1">{totalCount} 条评分</span>
        </div>

        {/* 评分分布 */}
        <div className="flex-1 space-y-1 min-w-0">
          {distEntries.map((entry) => (
            <div key={entry.stars} className="flex items-center gap-2">
              <span className="text-xs text-text-muted w-6 text-right shrink-0">
                {entry.stars} 星
              </span>
              <div className="flex-1 h-2.5 bg-bg-tertiary rounded-full overflow-hidden">
                <div
                  className="h-full bg-warning rounded-full transition-all duration-300"
                  style={{
                    width: totalCount > 0
                      ? `${(entry.count / totalCount) * 100}%`
                      : '0%'
                  }}
                />
              </div>
              <span className="text-xs text-text-muted w-6 shrink-0">
                {entry.count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 我的评分 / 提交评分 */}
      <div className="border-t border-border-light pt-4">
        {myReview && !editing ? (
          <div className="bg-bg-tertiary rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-text-primary">你的评分</h4>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs text-primary hover:text-primary-hover transition-colors"
                >
                  编辑评分
                </button>
                <button
                  onClick={handleDelete}
                  className="text-xs text-danger hover:text-danger/80 transition-colors"
                >
                  删除评分
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 mb-1">
              <StarRating rating={myReview.rating} size={14} />
              <span className="text-xs text-text-muted">
                {new Date(myReview.updatedAt).toLocaleString('zh-CN')}
              </span>
            </div>
            {myReview.comment && (
              <p className="text-sm text-text-secondary mt-2">{myReview.comment}</p>
            )}
          </div>
        ) : (
          <div className="bg-bg-tertiary rounded-lg p-4">
            <h4 className="text-sm font-semibold text-text-primary mb-3">
              {editing ? '编辑评分' : '写评分'}
            </h4>
            <div className="flex items-center gap-2 mb-3">
              <StarRating rating={myRating} size={20} interactive onChange={setMyRating} />
              {myRating > 0 && (
                <span className="text-xs text-text-muted">
                  {myRating} 星
                </span>
              )}
            </div>
            <textarea
              value={myComment}
              onChange={(e) => setMyComment(e.target.value)}
              placeholder="分享你的使用体验（可选）"
              rows={3}
              className="w-full bg-bg-card border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-primary/50 transition-colors mb-3"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleSubmit}
                disabled={myRating < 1 || submitting}
                className="px-4 py-1.5 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors text-sm font-medium"
              >
                {submitting ? '提交中...' : '提交'}
              </button>
              {editing && (
                <button
                  onClick={() => {
                    setEditing(false)
                    if (myReview) {
                      setMyRating(myReview.rating)
                      setMyComment(myReview.comment || '')
                    }
                  }}
                  className="px-4 py-1.5 border border-border-light rounded-lg hover:bg-bg-card transition-colors text-sm text-text-secondary"
                >
                  取消
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 评分列表 */}
      <div className="border-t border-border-light pt-4">
        <h4 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-1.5">
          <MessageSquare size={14} />
          所有评分 ({total})
        </h4>

        {reviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-text-muted">
            <Star size={32} className="text-text-muted/30" />
            <p className="text-sm">暂无评分</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map((review) => (
              <div
                key={review.id}
                className="bg-bg-tertiary rounded-lg p-3"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                      {(review.username || '?')[0].toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-text-primary">
                      {review.username || '匿名用户'}
                    </span>
                  </div>
                  <span className="text-xs text-text-muted">
                    {new Date(review.createdAt).toLocaleString('zh-CN')}
                  </span>
                </div>
                <StarRating rating={review.rating} size={12} />
                {review.comment && (
                  <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">
                    {review.comment}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded hover:bg-bg-tertiary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-text-muted">
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="p-1.5 rounded hover:bg-bg-tertiary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ================================================================
 * 共享子组件
 * ================================================================ */

/** 区块标题 */
function Section({
  title,
  icon,
  children
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-text-primary mb-2.5">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  )
}

/** 信息行（标签/值对） */
function InfoRow({
  label,
  value,
  mono
}: {
  label: string
  value: string
  mono?: boolean
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-text-muted">{label}</span>
      <span
        className={`text-sm text-text-primary truncate ${
          mono ? 'font-mono text-xs' : ''
        }`}
        title={value}
      >
        {value}
      </span>
    </div>
  )
}

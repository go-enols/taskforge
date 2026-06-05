/**
 * @file DebugPage — 脚本调试页
 * @description 提供脚本的实时调试环境：选择项目文件夹、查看 Schema、匹配账户、
 *              设置沙箱模式、运行/暂停/恢复/停止任务、查看实时日志与输出。
 * @module renderer/pages
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Play,
  Square,
  Pause,
  RotateCcw,
  Bug,
  FolderOpen,
  FileCode,
  User as UserIcon,
  Terminal,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp
} from 'lucide-react'
import { taskApi, fileApi, accountApi, dialogApi } from '../api'
import type { TaskLog, TaskLogLevel, Task, Account, TaskOutput } from '../../../../src/shared/types'
import LogViewer from '../components/common/LogViewer'
import { DynamicForm } from '../components/common'
import { jsonSchemaToFieldMeta, type FieldMeta } from '../../../shared/schemas/task-params'
import { toast } from '../utils/toast'

/** manifest.json 文件名常量 */
const MANIFEST_FILENAME = 'manifest.json'
/** meta.json 文件名常量 */
const META_FILENAME = 'meta.json'

/** 移除 JSON 字符串中的块注释和行内注释 */
const stripJsonComments = (raw: string): string =>
  raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')

/** 尝试解析 JSON（支持带注释的 JSON），失败返回 null */
const tryParseJson = (raw: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(stripJsonComments(raw))
  } catch {
    return null
  }
}

/** 项目文件夹元信息 */
interface FolderInfo {
  /** 文件夹名 */
  name: string
  /** 入口文件名（如 index.js） */
  entry: string
  /** 是否包含 manifest.json */
  hasManifest: boolean
  /** 需要的账户模板 ID 列表 */
  requiredTemplates: string[]
  /** 脚本声明的权限列表 */
  permissions: string[]
  /** 任务配置 Schema */
  schema: Record<string, unknown> | null
}

/** 创建空文件夹信息对象 */
const emptyFolderInfo = (path: string): FolderInfo => ({
  name: path.split(/[/\\]/).pop() || 'unknown',
  entry: 'index.js',
  hasManifest: false,
  requiredTemplates: [],
  permissions: [],
  schema: null
})

/** 格式化毫秒数为可读时长（如 1.500s） */
const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`
  const s = Math.floor(ms / 1000)
  const ms2 = ms % 1000
  return `${s}.${String(ms2).padStart(3, '0')}s`
}

/** 格式化字节数为可读大小（B/KB/MB） */
const formatBytes = (n: number): string => {
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`
  return `${(n / (1024 * 1024)).toFixed(2)}MB`
}

/**
 * DebugPage — 脚本调试页面组件
 *
 * 提供完整的脚本调试流程：选择项目文件夹 → 解析 manifest →
 * 匹配账户 → 配置参数 → 运行/暂停/恢复/停止 → 查看日志和结果。
 */
const DebugPage: React.FC = () => {
  const { t } = useTranslation()
  // Core state
  const [folderPath, setFolderPath] = useState('')
  const [folderInfo, setFolderInfo] = useState<FolderInfo | null>(null)
  const [matchedAccounts, setMatchedAccounts] = useState<Account[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [useSandbox, setUseSandbox] = useState(true)
  const [configValues, setConfigValues] = useState<Record<string, unknown>>({})

  // Task state
  const [taskId, setTaskId] = useState<string | null>(null)
  const [taskStatus, setTaskStatus] = useState<Task['status']>('idle')
  const [logs, setLogs] = useState<TaskLog[]>([])
  const [output, setOutput] = useState<TaskOutput | null>(null)
  const [progress, setProgress] = useState<{ percent: number; message: string } | null>(null)

  // Reset on new folder pick
  const reset = useCallback((): void => {
    setMatchedAccounts([])
    setSelectedAccountId(null)
    setTaskId(null)
    setTaskStatus('idle')
    setLogs([])
    setOutput(null)
    setProgress(null)
    setConfigValues({})
  }, [])

  // Stable refs for the poller so the interval survives re-renders
  // (refs are mirrored from state via useEffect — never assign ref.current during render)
  const taskIdRef = useRef<string | null>(null)
  const statusRef = useRef<Task['status']>('idle')
  const folderPathRef = useRef<string>('')
  useEffect(() => {
    taskIdRef.current = taskId
  }, [taskId])
  useEffect(() => {
    statusRef.current = taskStatus
  }, [taskStatus])
  useEffect(() => {
    folderPathRef.current = folderPath
  }, [folderPath])

  // -------- Folder selection + manifest parse --------
  const handleSelectFolder = useCallback(async () => {
    try {
      const result = await fileApi.selectFolder()
      if (!result || result.canceled || !result.folderPath) return
      const dir = result.folderPath
      setFolderPath(dir)
      setFolderInfo(emptyFolderInfo(dir))
      reset()

      let manifest: Record<string, unknown> | null = null
      for (const filename of [MANIFEST_FILENAME, META_FILENAME]) {
        try {
          const res = await fileApi.readFile(`${dir}/${filename}`)
          if (res.success && res.content) {
            manifest = tryParseJson(res.content)
            if (manifest) break
          }
        } catch (err) {
          console.error(`[Debug] Failed to read ${filename}:`, err)
        }
      }

      const info = emptyFolderInfo(dir)
      if (manifest) {
        info.name = (manifest.name as string) || info.name
        info.entry = (manifest.entryPoint as string) || 'index.js'
        info.hasManifest = 'schema' in manifest
        if (Array.isArray(manifest.requiredAccountTemplateIds)) {
          info.requiredTemplates = manifest.requiredAccountTemplateIds as string[]
        }
        if (Array.isArray(manifest.permissions)) {
          info.permissions = manifest.permissions as string[]
        }
        if (manifest.schema && typeof manifest.schema === 'object') {
          info.schema = manifest.schema as Record<string, unknown>
        }
      }
      setFolderInfo(info)

      if (info.requiredTemplates.length > 0) {
        try {
          const res = await accountApi.list(1, 9999)
          const all = res.items || []
          const matched = all.filter((a) => info.requiredTemplates.includes(a.templateId))
          setMatchedAccounts(matched)
          if (matched.length > 0) setSelectedAccountId(matched[0].id)
        } catch (err) {
          console.error('[Debug] Failed to load matched accounts:', err)
        }
      }
    } catch (err) {
      console.error('[Debug] handleSelectFolder failed:', err)
      toast.error(err instanceof Error ? err.message : t('common.operationFailed'))
    }
  }, [reset, t])

  // -------- IPC push subscriptions (status, logs) --------
  useEffect(() => {
    if (!window.electronAPI?.on) return
    const unsubStatus = window.electronAPI.on('task:statusChanged', (data) => {
      const d = data as { id: string; status: string }
      if (d.id === taskIdRef.current) {
        setTaskStatus(d.status as Task['status'])
        if (['complete', 'error', 'stopped'].includes(d.status)) {
          // Stop polling; fetch final output
          taskApi.getOutput(d.id).then(setOutput).catch(() => undefined)
        }
      }
    })
    const unsubLog = window.electronAPI.on('task:log', (data) => {
      const d = data as { taskId: string; logs: Array<{ id: number; level: string; message: string; timestamp: string }> }
      if (d.taskId !== taskIdRef.current) return
      setLogs((prev) => {
        const next = [...prev, ...d.logs.map<TaskLog>((l) => ({
          id: l.id,
          taskId: d.taskId,
          timestamp: l.timestamp,
          level: l.level as TaskLogLevel,
          message: l.message
        }))]
        return next.length > 500 ? next.slice(-500) : next
      })
    })
    return () => {
      unsubStatus()
      unsubLog()
    }
  }, [])

  // -------- Progress polling while running --------
  useEffect(() => {
    if (taskStatus !== 'running' || !taskId) return
    let cancelled = false
    const tick = async (): Promise<void> => {
      try {
        const p = await taskApi.getProgress(taskId)
        if (!cancelled) setProgress(p)
      } catch {
        // ignore
      }
    }
    void tick()
    const id = setInterval(tick, 1500)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [taskStatus, taskId])

  // -------- Run / Stop / Pause / Resume / Clear --------
  const handleRun = useCallback(async () => {
    if (!folderPath) return
    const acc = matchedAccounts.find((a) => a.id === selectedAccountId)
    const config: Record<string, unknown> = { ...configValues }
    if (acc) {
      config._account_id = acc.id
      config._account_data = acc.data
      config._account_pool = acc.pool
    }

    try {
      const task = await taskApi.create({
        scriptFolder: folderPath,
        config,
        isSandbox: useSandbox
      })
      setTaskId(task.id)
      setTaskStatus('running')
      setLogs([])
      setOutput(null)
      setProgress(null)
      await taskApi.start(task.id)
      toast.success(`${t('debug.runStarted')}: ${folderInfo?.name || folderPath}${useSandbox ? ' 🔒' : ''}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.operationFailed'))
    }
  }, [folderPath, folderInfo, matchedAccounts, selectedAccountId, configValues, useSandbox, t])

  const handleStop = useCallback(async () => {
    if (!taskId) return
    try {
      await taskApi.stop(taskId)
    } catch (e) {
      console.error('[Debug] Failed to stop task:', e)
    }
  }, [taskId])

  const handlePause = useCallback(async () => {
    if (!taskId) return
    try {
      await taskApi.pause(taskId)
    } catch (e) {
      console.error('[Debug] Failed to pause task:', e)
    }
  }, [taskId])

  const handleResume = useCallback(async () => {
    if (!taskId) return
    try {
      await taskApi.resume(taskId)
    } catch (e) {
      console.error('[Debug] Failed to resume task:', e)
    }
  }, [taskId])

  const handleClearLogs = useCallback(async () => {
    if (taskId) {
      try {
        await taskApi.clearLogs(taskId)
      } catch (e) {
        console.error('[Debug] clearLogs failed:', e)
      }
    }
    setLogs([])
  }, [taskId])

  const handleExportLogs = useCallback(async (exportLogs: TaskLog[]) => {
    const text = exportLogs
      .map((l) => `${l.timestamp} [${l.level.toUpperCase()}] ${l.message}`)
      .join('\n')
    const res = await dialogApi.saveFile(`debug-logs-${Date.now()}.log`, text)
    if (res?.filePath) toast.success(t('debug.exported'))
  }, [t])

  const isRunning = taskStatus === 'running'
  const isPaused = taskStatus === 'paused'
  const canRun = !!folderPath && (matchedAccounts.length === 0 || !!selectedAccountId) && !isRunning

  const schemaFields: FieldMeta[] = folderInfo?.schema
    ? jsonSchemaToFieldMeta(folderInfo.schema)
    : []

  const matchedTemplateIds = folderInfo?.requiredTemplates ?? []
  const selectedAccount = matchedAccounts.find((a) => a.id === selectedAccountId) ?? null

  return (
    <div className="space-y-3" data-testid="debug-page">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Bug className="w-5 h-5 text-primary" />
        <h1 className="text-2xl font-bold text-text-primary">{t('debug.title')}</h1>
        <span className="text-xs text-text-muted ml-2">{t('debug.subtitle')}</span>
      </div>

      {/* Top strip: project info + sandbox */}
      <div className="bg-bg-card rounded-xl border border-border-light p-4 space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2 min-w-fit">
            <FolderOpen size={14} className="text-text-muted" />
            {t('debug.projectFolder')}
          </h2>
          <button
            type="button"
            data-testid="debug-select-folder"
            onClick={() => void handleSelectFolder()}
            disabled={isRunning}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border-light text-text-secondary text-xs hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-50"
          >
            <FolderOpen size={14} />
            {folderPath ? t('debug.changeFolder') : t('debug.selectFolder')}
          </button>
          <label className="ml-auto inline-flex items-center gap-1.5 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              data-testid="debug-sandbox"
              checked={useSandbox}
              onChange={(e) => setUseSandbox(e.target.checked)}
              disabled={isRunning}
              className="rounded"
            />
            <span className="text-text-secondary">{t('debug.sandbox')}</span>
            <span className="text-text-muted">({useSandbox ? t('debug.sandboxOn') : t('debug.sandboxOff')})</span>
          </label>
        </div>

        {folderPath && (
          <div className="font-mono text-[11px] text-text-secondary bg-bg-page rounded px-2 py-1 break-all">
            {folderPath}
          </div>
        )}

        {folderInfo && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
            <div className="flex flex-col gap-0.5">
              <span className="text-text-muted">{t('debug.field.name')}</span>
              <span className="text-text-primary font-medium truncate">{folderInfo.name}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-text-muted">{t('debug.field.entry')}</span>
              <span className="text-text-primary font-mono">{folderInfo.entry}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-text-muted">{t('debug.field.config')}</span>
              <span className={folderInfo.hasManifest ? 'text-success' : 'text-text-muted'}>
                {folderInfo.hasManifest ? MANIFEST_FILENAME : `${META_FILENAME} / ${t('debug.inferred')}`}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-text-muted">{t('debug.field.deps')}</span>
              <span className="text-text-muted">{t('debug.autoInstall')}</span>
            </div>
            {matchedTemplateIds.length > 0 && (
              <div className="col-span-2 md:col-span-4 flex flex-col gap-0.5">
                <span className="text-text-muted">{t('debug.field.templates')}</span>
                <span className="text-text-primary font-mono text-[10px]">{matchedTemplateIds.join(', ')}</span>
              </div>
            )}
            {folderInfo.permissions.length > 0 && (
              <div className="col-span-2 md:col-span-4 flex items-center gap-1.5 flex-wrap">
                <span className="text-text-muted">{t('debug.field.permissions')}:</span>
                {folderInfo.permissions.map((p) => (
                  <span
                    key={p}
                    className="inline-block px-1.5 py-0.5 text-[10px] bg-bg-tertiary text-text-secondary rounded"
                  >
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main 2-column area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* LEFT: matched accounts + schema form + run controls */}
        <div className="space-y-3">
          {/* Matched accounts */}
          {folderInfo && matchedTemplateIds.length > 0 && (
            <div className="bg-bg-card rounded-xl border border-border-light p-4 space-y-2">
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <UserIcon size={14} className="text-text-muted" />
                {t('debug.matchedAccounts')}
                <span className="text-[10px] text-text-muted">
                  ({matchedAccounts.length} {t('debug.of')} {matchedTemplateIds.length})
                </span>
              </h3>
              {matchedAccounts.length === 0 ? (
                <p className="text-xs text-text-muted">{t('debug.noMatchedAccounts')}</p>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {matchedAccounts.map((a) => {
                    const summary =
                      typeof a.data === 'object' && a.data
                        ? Object.values(a.data as Record<string, unknown>)
                            .slice(0, 2)
                            .map((v) => String(v).slice(0, 16))
                            .join(' / ')
                        : a.id.slice(0, 8)
                    return (
                      <label
                        key={a.id}
                        className={`flex items-center gap-2 p-1.5 rounded border cursor-pointer transition-colors ${
                          selectedAccountId === a.id
                            ? 'border-primary/50 bg-primary/5'
                            : 'border-border-light hover:bg-bg-tertiary/40'
                        }`}
                      >
                        <input
                          type="radio"
                          name="debug-account"
                          value={a.id}
                          checked={selectedAccountId === a.id}
                          onChange={() => setSelectedAccountId(a.id)}
                          disabled={isRunning}
                          className="rounded-full"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-text-primary font-mono truncate">
                            {a.id.slice(0, 8)}
                          </div>
                          <div className="text-[10px] text-text-muted truncate">
                            {summary || a.pool}
                          </div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Schema form */}
          {folderInfo && schemaFields.length > 0 && (
            <div className="bg-bg-card rounded-xl border border-border-light p-4 space-y-2">
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <FileCode size={14} className="text-text-muted" />
                {t('debug.config')}
              </h3>
              <DynamicForm
                key={folderPath}
                fields={schemaFields}
                defaultValues={configValues}
                onValuesChange={setConfigValues}
                onSubmit={() => undefined}
                submitLabel=""
              />
            </div>
          )}

          {/* Run controls */}
          <div className="bg-bg-card rounded-xl border border-border-light p-4 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              data-testid="debug-run"
              onClick={() => void handleRun()}
              disabled={!canRun}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Play size={12} />
              {t('debug.run')}
            </button>
            <button
              type="button"
              data-testid="debug-pause"
              onClick={() => void handlePause()}
              disabled={!isRunning}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-secondary border border-border-light rounded-lg hover:bg-bg-tertiary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Pause size={12} />
              {t('debug.pause')}
            </button>
            <button
              type="button"
              data-testid="debug-resume"
              onClick={() => void handleResume()}
              disabled={!isPaused}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-secondary border border-border-light rounded-lg hover:bg-bg-tertiary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <RotateCcw size={12} />
              {t('debug.resume')}
            </button>
            <button
              type="button"
              data-testid="debug-stop"
              onClick={() => void handleStop()}
              disabled={!isRunning && !isPaused}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-danger border border-danger/30 rounded-lg hover:bg-danger-light disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Square size={12} />
              {t('debug.stop')}
            </button>

            <div className="ml-auto flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  taskStatus === 'running'
                    ? 'bg-primary-light text-primary'
                    : taskStatus === 'complete'
                      ? 'bg-success-light text-success'
                      : taskStatus === 'error'
                        ? 'bg-danger-light text-danger'
                        : taskStatus === 'paused'
                          ? 'bg-warning-light text-warning'
                          : 'bg-bg-tertiary text-text-secondary'
                }`}
              >
                {isRunning && (
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                )}
                {taskStatus}
              </span>
              {selectedAccount && (
                <span className="inline-flex items-center gap-1 text-[10px] text-text-muted">
                  <UserIcon size={10} />
                  {selectedAccount.id.slice(0, 8)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: live output (logs + progress + final output) */}
        <div className="space-y-3">
          {/* Progress bar (only while running) */}
          {isRunning && (
            <div className="bg-bg-card rounded-xl border border-border-light px-3 py-2 flex items-center gap-3">
              <TrendingUp size={14} className="text-primary shrink-0" />
              {progress ? (
                <>
                  <div className="flex-1 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-text-secondary tabular-nums shrink-0">
                    {progress.percent}%
                  </span>
                  {progress.message && (
                    <span className="text-[11px] text-text-muted truncate flex-1 min-w-0">
                      {progress.message}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-[11px] text-text-muted">{t('debug.startingUp')}</span>
              )}
            </div>
          )}

          {/* Log viewer */}
          <div className="bg-bg-card rounded-xl border border-border-light overflow-hidden h-96">
            <LogViewer
              logs={logs}
              onClear={taskId ? handleClearLogs : undefined}
              onExport={handleExportLogs}
            />
          </div>

          {/* Final output panel (shown after task ends) */}
          {output && (
            <div
              data-testid="debug-output-panel"
              className="bg-bg-card rounded-xl border border-border-light p-3 space-y-2"
            >
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                {output.exitCode === 0 ? (
                  <CheckCircle2 size={14} className="text-success" />
                ) : (
                  <XCircle size={14} className="text-danger" />
                )}
                {t('debug.result')}
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                <div className="flex flex-col gap-0.5">
                  <span className="text-text-muted">{t('debug.exitCode')}</span>
                  <span
                    className={`font-mono font-medium ${
                      output.exitCode === 0 ? 'text-success' : 'text-danger'
                    }`}
                  >
                    {output.exitCode}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-text-muted inline-flex items-center gap-1">
                    <Clock size={10} />
                    {t('debug.duration')}
                  </span>
                  <span className="font-mono text-text-primary">
                    {formatDuration(output.durationMs)}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-text-muted">stdout</span>
                  <span className="font-mono text-text-primary">
                    {formatBytes(new Blob([output.stdout]).size)}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-text-muted">stderr</span>
                  <span className="font-mono text-text-primary">
                    {formatBytes(new Blob([output.stderr]).size)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Empty state hint */}
          {!taskId && (
            <div className="bg-bg-card rounded-xl border border-dashed border-border-light p-4 flex flex-col items-center gap-2 text-text-muted text-xs">
              <Terminal size={20} className="opacity-50" />
              {t('debug.emptyHint')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default DebugPage

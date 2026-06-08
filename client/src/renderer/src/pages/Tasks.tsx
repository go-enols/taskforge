/**
 * @file Tasks — 任务管理页
 * @description 管理任务的完整生命周期：创建、启动、暂停、恢复、停止、编辑和删除。
 *              支持脚本浏览器、日志查看、账户匹配和沙箱模式。
 * @module renderer/pages
 */

import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Plus,
  Play,
  Pause,
  Square,
  Trash2,
  FileText,
  Edit3,
  CheckSquare as CheckSquareIcon,
  Square as SquareIcon,
  Trash,
  RefreshCw,
  Download,
  Globe
} from 'lucide-react'
import {
  taskApi,
  scriptApi,
  taskTemplateApi,
  templateApi,
  marketplaceApi,
  scriptParamApi
} from '../api'
import type { Task, TaskLog, InstalledScript, RemoteScript, ScriptParam } from '../types'
import type { FieldMeta } from '../../../shared/schemas/task-params'
import {
  jsonSchemaToFieldMeta,
  validateFormFields,
  unflattenDotNotation
} from '../../../shared/schemas/task-params'
import { usePaginatedList } from '../hooks'
import { SearchInput, Pagination, Modal, DynamicForm } from '../components/common'
import { toast } from '../utils/toast'

/** 每页显示任务数 */
const PAGE_SIZE = 20

/** 日志级别对应的文字颜色样式 */
const LOG_LEVEL_STYLES: Record<TaskLog['level'], string> = {
  info: 'text-success',
  warn: 'text-warning',
  error: 'text-danger',
  debug: 'text-text-muted'
}

/**
 * Tasks — 任务管理页面组件
 *
 * 提供任务分页列表，支持运行控制（启动/暂停/恢复/停止）、
 * 实时日志查看、进度跟踪、账户匹配和脚本浏览器。
 */
const Tasks: React.FC = () => {
  const { t } = useTranslation()
  const { items, totalPages, page, loading, setPage, setSearch, search, refresh } =
    usePaginatedList(taskApi.list, PAGE_SIZE)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [logs, setLogs] = useState<TaskLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newScriptFolder, setNewScriptFolder] = useState('')
  const [creating, setCreating] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [editScriptFolder, setEditScriptFolder] = useState('')
  const [editConfig, setEditConfig] = useState('{}')
  const [editing, setEditing] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [progressMap, setProgressMap] = useState<
    Record<string, { percent: number; message: string } | null>
  >({})
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [installedScripts, setInstalledScripts] = useState<InstalledScript[]>([])
  const [selectedScript, setSelectedScript] = useState<InstalledScript | null>(null)
  const [formFields, setFormFields] = useState<FieldMeta[]>([])
  const [formValues, setFormValues] = useState<Record<string, unknown>>({})
  const [showScriptBrowser, setShowScriptBrowser] = useState(false)
  const [remoteScripts, setRemoteScripts] = useState<RemoteScript[]>([])
  const [loadingScripts, setLoadingScripts] = useState(false)
  const [downloadingScriptId, setDownloadingScriptId] = useState<string | null>(null)
  const [logFilter, setLogFilter] = useState<string>('all')
  const logEndRef = useRef<HTMLDivElement | null>(null)
  const [requiredTemplates, setRequiredTemplates] = useState<string[]>([])
  const [availableScriptParams, setAvailableScriptParams] = useState<ScriptParam[]>([])
  const [selectedScriptParamIds, setSelectedScriptParamIds] = useState<Set<string>>(new Set())
  const [scriptParamPoolFilter, setScriptParamPoolFilter] = useState<string>('')
  const [batchMode, setBatchMode] = useState(false)
  const [availablePools, setAvailablePools] = useState<string[]>([])
  const [newIsSandbox, setNewIsSandbox] = useState(false)

  useEffect(() => {
    const runningTasks = items.filter((t) => t.status === 'running')
    if (runningTasks.length === 0) {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current)
        progressTimerRef.current = null
      }
      return
    }

    /** 轮询正在运行的任务进度 */
  const fetchProgress = async (): Promise<void> => {
      const entries = await Promise.all(
        runningTasks.map(async (task) => {
          try {
            const p = await taskApi.getProgress(task.id)
            return [task.id, p] as const
          } catch {
            return [task.id, null] as const
          }
        })
      )
      setProgressMap((prev) => {
        const next = { ...prev }
        for (const [id, p] of entries) {
          next[id] = p
        }
        return next
      })
    }

    fetchProgress()
    if (progressTimerRef.current) clearInterval(progressTimerRef.current)
    progressTimerRef.current = setInterval(fetchProgress, 3000)

    return () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current)
        progressTimerRef.current = null
      }
    }
  }, [items])

  const showError = (msg: string): string | number => toast.error(msg)
  const showSuccess = (msg: string): string | number => toast.success(msg)

  const loadInstalledScripts = async (): Promise<void> => {
    try {
      const scripts = await scriptApi.listInstalled()
      setInstalledScripts(scripts)
    } catch (e: unknown) {
      showError(t('common.operationFailed') + ': ' + String(e))
    }
  }

  const loadRemoteScripts = async (): Promise<void> => {
    setLoadingScripts(true)
    try {
      const result = await marketplaceApi.listScripts()
      setRemoteScripts(result.items || [])
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingScripts(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadInstalledScripts()
  }, [])

  useEffect(() => {
    if (showScriptBrowser) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadRemoteScripts()
    }
  }, [showScriptBrowser])

  useEffect(() => {
    const unsubscribe = window.electronAPI?.on?.('task:statusChanged', () => {
      refresh()
    })
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [refresh])

  useEffect(() => {
    if (!expandedId) return
    const unsubscribe = window.electronAPI?.on?.('task:log', (rawData) => {
      const data = rawData as {
        taskId: string
        logs: Array<{ level: string; message: string; timestamp: string }>
      }
      if (data.taskId === expandedId) {
        setLogs((prev) => {
          const newLogs = data.logs.map((l, i) => ({
            id: -(prev.length + i),
            taskId: data.taskId,
            timestamp: l.timestamp,
            level: l.level as TaskLog['level'],
            message: l.message
          }))
          const combined = [...prev, ...newLogs]
          return combined.length > 500 ? combined.slice(-500) : combined
        })
      }
    })
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [expandedId])

  useEffect(() => {
    const unsubscribe = window.electronAPI?.on?.('task:output', () => {
      refresh()
    })
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [refresh])

  useEffect(() => {
    if (expandedId && logs.length > 0) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, expandedId])

  /** 执行任务操作：启动/暂停/恢复/停止 */
  const handleAction = async (
    action: 'start' | 'stop' | 'pause' | 'resume' | 'delete',
    id: string
  ): Promise<void> => {
    try {
      await taskApi[action](id)
      refresh()
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleToggleExpand = async (taskId: string): Promise<void> => {
    if (expandedId === taskId) {
      setExpandedId(null)
      setLogs([])
      return
    }
    setExpandedId(taskId)
    setLogsLoading(true)
    setLogs([])
    try {
      const res = await taskApi.getLogs(taskId)
      setLogs(res)
    } catch (e: unknown) {
      showError(t('common.operationFailed') + ': ' + String(e))
      setLogs([])
    } finally {
      setLogsLoading(false)
    }
  }

  const handleClearLogs = async (taskId: string): Promise<void> => {
    try {
      await taskApi.clearLogs(taskId)
      setLogs([])
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleInstallScript = async (scriptId: string): Promise<void> => {
    setDownloadingScriptId(scriptId)
    try {
      await scriptApi.download(scriptId)
      await loadInstalledScripts()
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e))
    } finally {
      setDownloadingScriptId(null)
    }
  }

  const handleScriptSelect = (scriptId: string): void => {
    const script = installedScripts.find((s) => s.id === scriptId)
    if (script) {
      setSelectedScript(script)
      setNewScriptFolder(script.installPath)
      try {
        const schema = script.schema as Record<string, unknown>
        let fieldsToSet: FieldMeta[] = []
        if (schema.type === 'object' && schema.properties) {
          fieldsToSet = jsonSchemaToFieldMeta(schema)
        } else if (schema.fields && Array.isArray(schema.fields)) {
          const validTypes = new Set(['string', 'number', 'boolean', 'select', 'multiselect'])
          const raw = schema.fields as Array<Record<string, unknown>>
          const validated: FieldMeta[] = []
          for (const item of raw) {
            if (typeof item.name === 'string' && validTypes.has(item.type as string)) {
              validated.push(item as unknown as FieldMeta)
            } else {
              console.warn('[Tasks] Skipping invalid schema.fields entry:', item)
            }
          }
          fieldsToSet = validated
        }
        setFormFields(fieldsToSet)
        const defaults: Record<string, unknown> = {}
        for (const f of fieldsToSet) {
          if (f.defaultValue !== undefined) defaults[f.name] = f.defaultValue
        }
        setFormValues(defaults)
      } catch {
        setFormFields([])
        setFormValues({})
      }
      loadScriptParamsForScript(script)
    } else {
      setSelectedScript(null)
      setFormFields([])
      setFormValues({})
      setNewScriptFolder('')
      setRequiredTemplates([])
      setAvailableScriptParams([])
      setAvailablePools([])
      setSelectedScriptParamIds(new Set())
      setBatchMode(false)
    }
  }

  const loadScriptParamsForScript = async (script: InstalledScript): Promise<void> => {
    try {
      const tmpl = await taskTemplateApi.get(script.id)
      const manifest = tmpl?.manifest as Record<string, unknown> | undefined
      const requiredIds = manifest?.requiredAccountTemplateIds as string[] | undefined
      if (requiredIds && requiredIds.length > 0) {
        setRequiredTemplates(requiredIds)
        const res = await scriptParamApi.list(1, 9999)
        const params = (res.items || []).filter((a) => requiredIds.includes(a.templateId))
        setAvailableScriptParams(params)
        const pools = [...new Set(params.map((a) => a.pool).filter(Boolean))]
        setAvailablePools(pools)
      } else {
        setRequiredTemplates([])
        setAvailableScriptParams([])
        setAvailablePools([])
        setSelectedScriptParamIds(new Set())
        setBatchMode(false)
      }
    } catch (e: unknown) {
      showError(t('common.operationFailed') + ': ' + String(e))
      setRequiredTemplates([])
      setAvailableScriptParams([])
      setAvailablePools([])
    }
  }

  const openScriptBrowser = async (): Promise<void> => {
    await loadInstalledScripts()
    setShowScriptBrowser(true)
  }

  const handleCreate = async (): Promise<void> => {
    if (!selectedScript) {
      showError(t('tasks.selectScriptError'))
      return
    }
    if (formFields.length > 0) {
      const errors = validateFormFields(formFields, formValues)
      if (Object.keys(errors).length > 0) {
        return
      }
    }
    try {
      const tmpl = await taskTemplateApi.get(selectedScript.id)
      if (tmpl?.manifest) {
        const manifest = tmpl.manifest as Record<string, unknown>
        const requiredIds = manifest.requiredAccountTemplateIds as string[] | undefined
        if (requiredIds && requiredIds.length > 0) {
          const installed = await templateApi.list(1, 9999)
          const installedIds = new Set(installed.items.map((t) => t.id))
          const missing = requiredIds.filter((id) => !installedIds.has(id))
          if (missing.length > 0) {
            showError(t('tasks.missingTemplates', { ids: missing.join(', ') }))
            return
          }
        }
      }
    } catch (e: unknown) {
      showError(t('common.operationFailed') + ': ' + String(e))
    }
    const rawConfig = formFields.length > 0 ? formValues : {}
    const config = unflattenDotNotation(rawConfig)

    if (batchMode && selectedScriptParamIds.size > 0 && requiredTemplates.length > 0) {
      const params = availableScriptParams.filter((a) => selectedScriptParamIds.has(a.id))
      await createBatchTasks(params, config)
    } else {
      await createSingleTask(config)
    }
  }

  const createSingleTask = async (config: Record<string, unknown>): Promise<void> => {
    const finalConfig = injectScriptParamData(config)
    setCreating(true)
    try {
      await taskApi.create({ scriptFolder: newScriptFolder, config: finalConfig, isSandbox: newIsSandbox })
      setShowCreate(false)
      resetCreateForm()
      refresh()
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  const createBatchTasks = async (
    params: ScriptParam[],
    config: Record<string, unknown>
  ): Promise<void> => {
    setCreating(true)
    let created = 0
    try {
      for (const param of params) {
        const scriptParamConfig = {
          ...config,
          _account_id: param.id,
          _account_data: param.data,
          _account_pool: param.pool
        }
        await taskApi.create({ scriptFolder: newScriptFolder, config: scriptParamConfig, isSandbox: newIsSandbox })
        created++
      }
      setShowCreate(false)
      resetCreateForm()
      refresh()
      showSuccess(t('tasks.batchCreated', { count: created }))
    } catch (e: unknown) {
      if (created > 0) {
        setShowCreate(false)
        resetCreateForm()
        refresh()
        showSuccess(t('tasks.batchCreatedPartial', { created, total: params.length }))
      } else {
        showError(e instanceof Error ? e.message : String(e))
      }
    } finally {
      setCreating(false)
    }
  }

  const injectScriptParamData = (config: Record<string, unknown>): Record<string, unknown> => {
    if (requiredTemplates.length === 0) return config
    const selected = availableScriptParams.filter((a) => selectedScriptParamIds.has(a.id))
    if (selected.length === 0) return config
    return {
      ...config,
      _accounts: selected.map((a) => ({
        id: a.id,
        templateId: a.templateId,
        data: a.data,
        pool: a.pool,
        labels: a.labels,
        notes: a.notes
      }))
    }
  }

  const resetCreateForm = (): void => {
    setNewScriptFolder('')
    setSelectedScript(null)
    setFormFields([])
    setFormValues({})
    setRequiredTemplates([])
    setAvailableScriptParams([])
    setAvailablePools([])
    setSelectedScriptParamIds(new Set())
    setBatchMode(false)
    setScriptParamPoolFilter('')
    setNewIsSandbox(false)
  }

  const toggleScriptParamSelect = (id: string): void => {
    setSelectedScriptParamIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllScriptParams = (): void => {
    const filtered = getFilteredScriptParams()
    if (selectedScriptParamIds.size === filtered.length && filtered.length > 0) {
      setSelectedScriptParamIds(new Set())
    } else {
      setSelectedScriptParamIds(new Set(filtered.map((a) => a.id)))
    }
  }

  const getFilteredScriptParams = (): ScriptParam[] => {
    if (!scriptParamPoolFilter) return availableScriptParams
    return availableScriptParams.filter((a) => a.pool === scriptParamPoolFilter)
  }

  const handleOpenEdit = (task: Task): void => {
    setEditTask(task)
    setEditScriptFolder(task.scriptFolder)
    setEditConfig(JSON.stringify(task.config, null, 2))
    setShowEdit(true)
  }

  const handleEdit = async (): Promise<void> => {
    if (!editTask) return
    let config: Record<string, unknown>
    try {
      config = JSON.parse(editConfig)
    } catch {
      showError(t('tasks.config') + ' JSON ' + t('common.error'))
      return
    }
    setEditing(true)
    try {
      await taskApi.update(editTask.id, { scriptFolder: editScriptFolder, config })
      setShowEdit(false)
      setEditTask(null)
      refresh()
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e))
    } finally {
      setEditing(false)
    }
  }

  /** 切换单个任务的选择状态 */
  const toggleSelect = (id: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = (): void => {
    if (!items.length) return
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(items.map((t) => t.id)))
    }
  }

  const handleBatchAction = async (action: 'start' | 'stop' | 'delete'): Promise<void> => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    const results = await Promise.allSettled(ids.map((id) => taskApi[action](id)))
    const succeeded = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.filter((r) => r.status === 'rejected').length
    setSelectedIds(new Set())
    refresh()
    if (failed === 0) {
      showSuccess(t('tasks.batchSuccess', { count: succeeded }))
    } else if (succeeded > 0) {
      showError(t('tasks.batchPartial', { succeeded, failed }))
    } else {
      showError(t('tasks.batchFailed', { count: failed }))
    }
  }

  const formatTime = (v: string | null): string => {
    if (!v) return '-'
    return new Date(v).toLocaleString()
  }

  const renderActionButtons = (task: Task): React.JSX.Element => {
    const btnBase = 'p-1.5 rounded-lg transition-colors '
    const s = task.status

    if (s === 'running') {
      return (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleAction('pause', task.id)
            }}
            className={btnBase + 'text-warning hover:bg-warning-light'}
            title={t('tasks.pause')}
            aria-label={t('tasks.pause')}
          >
            <Pause size={15} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleAction('stop', task.id)
            }}
            className={btnBase + 'text-orange hover:bg-orange-light'}
            title={t('tasks.stop')}
            aria-label={t('tasks.stop')}
          >
            <Square size={15} />
          </button>
        </>
      )
    }

    if (s === 'paused') {
      return (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleAction('resume', task.id)
            }}
            className={btnBase + 'text-success hover:bg-success-light'}
            title={t('tasks.resume')}
            aria-label={t('tasks.resume')}
          >
            <Play size={15} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleAction('stop', task.id)
            }}
            className={btnBase + 'text-orange hover:bg-orange-light'}
            title={t('tasks.stop')}
            aria-label={t('tasks.stop')}
          >
            <Square size={15} />
          </button>
        </>
      )
    }

    return (
      <>
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleAction('start', task.id)
          }}
          className={btnBase + 'text-primary hover:bg-primary-light'}
          title={t('tasks.start')}
          aria-label={t('tasks.start')}
        >
          <Play size={15} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleOpenEdit(task)
          }}
          className={btnBase + 'text-text-secondary hover:bg-bg-tertiary'}
          title={t('tasks.editTask')}
          aria-label={t('tasks.editTask')}
        >
          <Edit3 size={15} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleAction('delete', task.id)
          }}
          className={btnBase + 'text-danger hover:bg-danger-light'}
          title={t('common.delete')}
          aria-label={t('common.delete')}
        >
          <Trash2 size={15} />
        </button>
      </>
    )
  }

  const allSelected = items.length > 0 && selectedIds.size === items.length

  return (
    <div className="space-y-4">
      {/* 页面标题与操作按钮 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">{t('tasks.title')}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-light text-sm hover:bg-bg-card-hover transition-colors"
          >
            <RefreshCw size={14} />
            {t('common.refresh')}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
          >
            <Plus size={16} />
            {t('tasks.createTask')}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('tasks.searchPlaceholder')}
          className="flex-1 max-w-sm"
          inputClassName="w-full pl-9 pr-3 py-2 rounded-lg border border-border-light bg-bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {selectedIds.size > 0 && (
          <div
            className="flex items-center gap-2"
            role="toolbar"
            aria-label={t('tasks.batchActions')}
          >
            <span className="text-sm text-text-muted">
              {t('tasks.selectedCount', { count: selectedIds.size })}
            </span>
            <button
              onClick={() => handleBatchAction('start')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
            >
              <Play size={13} />
              {t('tasks.batchStart')}
            </button>
            <button
              onClick={() => handleBatchAction('stop')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-orange-light text-orange text-xs font-medium hover:bg-orange/20 transition-colors"
            >
              <Square size={13} />
              {t('tasks.batchStop')}
            </button>
            <button
              onClick={() => handleBatchAction('delete')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-danger-light text-danger text-xs font-medium hover:bg-danger/20 transition-colors"
            >
              <Trash size={13} />
              {t('tasks.batchDelete')}
            </button>
          </div>
        )}
      </div>

      {loading && items.length === 0 ? (
        <div className="text-center py-12 text-text-muted">{t('common.loading')}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-text-muted">{t('tasks.noTasks')}</div>
      ) : (
        <div className="rounded-xl border border-border-light overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-tertiary">
                <th className="px-4 py-3 w-10">
                  <button
                    onClick={toggleSelectAll}
                    className="text-text-muted hover:text-text-primary transition-colors"
                    aria-label={t('common.selectAll')}
                  >
                    {allSelected ? <CheckSquareIcon size={16} /> : <SquareIcon size={16} />}
                  </button>
                </th>
                <th className="px-4 py-3 font-medium text-text-muted">{t('common.status')}</th>
                <th className="px-4 py-3 font-medium text-text-muted">{t('tasks.startTime')}</th>
                <th className="px-4 py-3 font-medium text-text-muted">{t('tasks.endTime')}</th>
                <th className="px-4 py-3 font-medium text-text-muted text-right">
                  {t('tasks.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((task) => (
                <tr key={task.id} className="border-b border-border-light/50">
                  <td colSpan={5} className="p-0">
                    <div
                      onClick={() => handleToggleExpand(task.id)}
                      className="flex items-center cursor-pointer hover:bg-bg-card-hover transition-colors"
                    >
                      <div className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => toggleSelect(task.id)}
                          className="text-text-muted hover:text-text-primary transition-colors"
                          aria-label={t('tasks.selectTask')}
                        >
                          {selectedIds.has(task.id) ? (
                            <CheckSquareIcon size={16} className="text-primary" />
                          ) : (
                            <SquareIcon size={16} />
                          )}
                        </button>
                      </div>
                       <div className="flex-1 grid grid-cols-[100px_160px_160px] items-center">
                        <div className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-status-${task.status}-bg text-status-${task.status}-text`}
                          >
                            {task.status === 'running' && (
                              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                            )}
                            {t(`tasks.status.${task.status}`)}
                          </span>
                        </div>
                        <div className="px-4 py-3 text-text-secondary text-xs">
                          {formatTime(task.startedAt)}
                        </div>
                        <div className="px-4 py-3 text-text-secondary text-xs">
                          {formatTime(task.endedAt)}
                        </div>
                      </div>
                      <div
                        className="flex items-center gap-1 px-4 py-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {renderActionButtons(task)}
                      </div>
                    </div>
                    {task.status === 'running' && progressMap[task.id] && (
                      <div className="px-4 py-2 border-t border-border-light/50 bg-bg-tertiary/50">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-text-muted shrink-0">
                            {t('tasks.progress')}
                          </span>
                          <div className="flex-1 h-2 bg-bg-card rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all duration-500"
                              style={{
                                width: `${Math.min(100, Math.max(0, progressMap[task.id]!.percent))}%`
                              }}
                            />
                          </div>
                          <span className="text-xs font-mono text-text-muted shrink-0">
                            {progressMap[task.id]!.percent}%
                          </span>
                          {progressMap[task.id]!.message && (
                            <span className="text-xs text-text-muted truncate max-w-[200px]">
                              {progressMap[task.id]!.message}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {expandedId === task.id && (
                      <div className="border-t border-border-light bg-bg-tertiary/30">
                        <div className="flex items-center justify-between px-4 py-2 border-b border-border-light">
                          <div className="flex items-center gap-2">
                            <FileText size={14} className="text-text-muted" />
                            <span className="text-xs font-medium text-text-muted">
                              {t('tasks.logs')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              value={logFilter}
                              onChange={(e) => setLogFilter(e.target.value)}
                              className="px-1.5 py-0.5 rounded text-xs border border-border-light bg-bg-card"
                            >
                              <option value="all">{t('tasks.logFilter.all')}</option>
                              <option value="info">{t('tasks.logFilter.info')}</option>
                              <option value="warn">{t('tasks.logFilter.warn')}</option>
                              <option value="error">{t('tasks.logFilter.error')}</option>
                              <option value="debug">{t('tasks.logFilter.debug')}</option>
                            </select>
                            <button
                              onClick={() => handleClearLogs(task.id)}
                              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-danger hover:bg-danger-light transition-colors"
                            >
                              <Trash2 size={12} />
                              {t('tasks.clearLogs')}
                            </button>
                          </div>
                        </div>
                        <div className="max-h-64 overflow-y-auto px-4 py-2">
                          {logsLoading ? (
                            <div className="text-xs text-text-muted py-2">
                              {t('common.loading')}
                            </div>
                          ) : logs.length === 0 ? (
                            <div className="text-xs text-text-muted py-2">{t('tasks.noLogs')}</div>
                          ) : (
                            <div className="space-y-0.5 font-mono text-xs">
                              {logs
                                .filter((log) => logFilter === 'all' || log.level === logFilter)
                                .map((log, idx) => (
                                  <div key={log.id ?? idx} className="flex gap-3">
                                    <span className="text-text-muted shrink-0">
                                      {new Date(log.timestamp).toLocaleTimeString()}
                                    </span>
                                    <span
                                      className={`shrink-0 w-10 ${LOG_LEVEL_STYLES[log.level]}`}
                                    >
                                      [{log.level.toUpperCase()}]
                                    </span>
                                    <span className="text-text-secondary break-all">
                                      {log.message}
                                    </span>
                                  </div>
                                ))}
                              <div ref={logEndRef} />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
          pageText={`${page} / ${totalPages}`}
        />
      )}

      <Modal
        open={showCreate}
        onClose={() => {
          setShowCreate(false)
          resetCreateForm()
        }}
        title={t('tasks.createTask')}
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t('tasks.selectScript')}</label>
            <div className="flex gap-2">
              <select
                value={selectedScript?.id ?? ''}
                onChange={(e) => handleScriptSelect(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-border-light bg-bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">{t('tasks.selectScriptPlaceholder')}</option>
                {installedScripts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (v{s.version})
                  </option>
                ))}
              </select>
              <button
                onClick={openScriptBrowser}
                className="flex items-center gap-1 px-3 py-2 rounded-lg border border-border-light text-sm hover:bg-bg-card-hover transition-colors"
              >
                <Globe size={14} />
                {t('tasks.browseScripts')}
              </button>
            </div>
          </div>
          {!selectedScript && (
            <div className="text-sm text-text-muted py-2">{t('tasks.selectScriptHint')}</div>
          )}
          {selectedScript && (
            <div className="flex items-center gap-3 px-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={newIsSandbox}
                  onChange={(e) => setNewIsSandbox(e.target.checked)}
                  className="rounded"
                />
                <span className="text-text-secondary">{t('tasks.sandboxMode')}</span>
              </label>
              {selectedScript.permissions && (
                <span className="text-xs text-text-muted">
                  {t('tasks.scriptPermissions')}
                  {selectedScript.permissions.network && (
                    <span className="ml-1 px-1.5 py-0.5 rounded bg-primary-light text-primary text-xs">network</span>
                  )}
                  {selectedScript.permissions.filesystem && (
                    <span className="ml-1 px-1.5 py-0.5 rounded bg-success-light text-success text-xs">filesystem</span>
                  )}
                  {!selectedScript.permissions.network && !selectedScript.permissions.filesystem && (
                    <span className="ml-1 text-text-muted">{t('common.none')}</span>
                  )}
                </span>
              )}
            </div>
          )}
          {availableScriptParams.length > 0 && (
            <div className="border border-border-light rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-secondary">
                  {t('tasks.selectScriptParams')}
                </span>
                <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={batchMode}
                    onChange={(e) => setBatchMode(e.target.checked)}
                    className="rounded"
                  />
                  {t('tasks.batchMode')}
                </label>
              </div>
              {availablePools.length > 1 && (
                <select
                  value={scriptParamPoolFilter}
                  onChange={(e) => setScriptParamPoolFilter(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs rounded border border-border-light bg-bg-card focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">
                    {t('scriptParams.pool')}: {t('tasks.allPools')}
                  </option>
                  {availablePools.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              )}
              <div className="max-h-40 overflow-y-auto space-y-0.5">
                <div className="flex items-center gap-2 px-1 py-0.5">
                  <input
                    type="checkbox"
                    checked={
                      selectedScriptParamIds.size === getFilteredScriptParams().length &&
                      getFilteredScriptParams().length > 0
                    }
                    onChange={selectAllScriptParams}
                    className="rounded"
                  />
                  <span className="text-xs text-text-muted">
                    {t('common.selectAll')} ({getFilteredScriptParams().length})
                  </span>
                </div>
                {getFilteredScriptParams().map((a) => (
                  <label
                    key={a.id}
                    className="flex items-center gap-2 px-1 py-1 rounded hover:bg-bg-card-hover cursor-pointer text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={selectedScriptParamIds.has(a.id)}
                      onChange={() => toggleScriptParamSelect(a.id)}
                      className="rounded"
                    />
                    <span className="text-text-primary truncate">
                      {typeof a.data === 'object' && a.data
                        ? Object.values(a.data as Record<string, unknown>)
                            .slice(0, 2)
                            .join(' / ')
                        : a.id.slice(0, 8)}
                    </span>
                    <span className="text-text-muted shrink-0">{a.pool}</span>
                  </label>
                ))}
              </div>
              {selectedScriptParamIds.size > 0 && (
                <div className="text-xs text-text-muted">
                  {batchMode
                    ? t('tasks.willCreateNTasks', { count: selectedScriptParamIds.size })
                    : t('tasks.selectedScriptParams', { count: selectedScriptParamIds.size })}
                </div>
              )}
            </div>
          )}
          {formFields.length > 0 && (
            <DynamicForm
              fields={formFields}
              defaultValues={formValues}
              onValuesChange={setFormValues}
              submitLabel=""
            />
          )}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={() => {
              setShowCreate(false)
              resetCreateForm()
            }}
            className="px-4 py-2 rounded-lg border border-border-light text-sm hover:bg-bg-card-hover transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !selectedScript}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover disabled:opacity-50 transition-colors"
          >
            {creating ? t('common.loading') : t('common.create')}
          </button>
        </div>
      </Modal>

      <Modal
        open={showEdit && !!editTask}
        onClose={() => setShowEdit(false)}
        title={t('tasks.editTask')}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t('tasks.config')} (JSON)</label>
            <textarea
              value={editConfig}
              onChange={(e) => setEditConfig(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 rounded-lg border border-border-light bg-bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary resize-y"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={() => setShowEdit(false)}
            className="px-4 py-2 rounded-lg border border-border-light text-sm hover:bg-bg-card-hover transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleEdit}
            disabled={editing || !editScriptFolder.trim()}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover disabled:opacity-50 transition-colors"
          >
            {editing ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </Modal>

      <Modal
        open={showScriptBrowser}
        onClose={() => setShowScriptBrowser(false)}
        title={t('tasks.browseRemoteTitle')}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          {remoteScripts.length === 0 ? (
            <div className="text-center py-8 text-text-muted text-sm">
              {loadingScripts ? t('common.loading') : t('tasks.noRemoteScripts')}
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {remoteScripts.map((script) => {
                const isInstalled = installedScripts.some((i) => i.id === script.id)
                const needsUpdate = installedScripts.some(
                  (i) => i.id === script.id && i.version !== script.version
                )
                return (
                  <div
                    key={script.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border-light hover:bg-bg-card-hover transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-text-primary">{script.name}</span>
                        <span className="text-xs font-mono text-text-muted">v{script.version}</span>
                        {isInstalled && !needsUpdate && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-success-light text-success">
                            {t('templates.installed')}
                          </span>
                        )}
                        {needsUpdate && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-warning-light text-warning">
                            {t('templates.updatable')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-text-muted mt-0.5 truncate">
                        {script.description}
                      </p>
                    </div>
                    <button
                      onClick={() => handleInstallScript(script.id)}
                      disabled={downloadingScriptId === script.id}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 disabled:opacity-50 transition-colors shrink-0"
                    >
                      <Download size={13} />
                      {downloadingScriptId === script.id
                        ? t('templates.installing')
                        : needsUpdate
                          ? t('templates.update')
                          : isInstalled
                            ? t('templates.reinstall')
                            : t('templates.install')}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

export default Tasks

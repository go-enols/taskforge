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
  scriptParamApi,
  walletApi,
  proxyApi
} from '../api'
import type {
  Task,
  TaskLog,
  InstalledScript,
  RemoteScript,
  ScriptParam,
  Wallet,
  Proxy,
  DataRequirement,
  DataSnapshot
} from '../types'
import type { FieldMeta } from '../../../shared/schemas/task-params'
import {
  jsonSchemaToFieldMeta,
  validateFormFields,
  unflattenDotNotation
} from '../../../shared/schemas/task-params'
import { usePaginatedList } from '../hooks'
import { SearchInput, Pagination, Modal, DynamicForm } from '../components/common'
import DataRequirementPanel, {
  type RequirementSelection,
  type DataForRequirement
} from '../components/DataRequirementPanel'
import { toast } from '../utils/toast'
import { useTaskState, useTaskLogBuffer } from '../utils/taskStateTracker'
import { DataViewer } from '../components/common/DataViewer'

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
  const [dataRequirements, setDataRequirements] = useState<DataRequirement[]>([])
  const [dataMap, setDataMap] = useState<Map<string, DataForRequirement>>(new Map())
  const [selections, setSelections] = useState<Map<string, RequirementSelection>>(new Map())
  const [batchMode, setBatchMode] = useState(false)
  const [newIsSandbox, setNewIsSandbox] = useState(false)
  const [tab, setTab] = useState<'logs' | 'data' | 'output'>('logs')
  const [dataSnapshots, setDataSnapshots] = useState<Map<string, DataSnapshot>>(new Map())

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
  // 订阅 task:data — 脚本推送的结构化数据快照
  useEffect(() => {
    const off = window.electronAPI.on('task:data', (snap) => {
      setDataSnapshots(prev => { const n = new Map(prev); n.set((snap as DataSnapshot).key, snap as DataSnapshot); return n })
    })
    return () => off?.()
  }, [])

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
      const result = await marketplaceApi.listScripts(undefined, 1, 9999)
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

  /**
   * 通过 TaskStateTracker 监听主进程推送的任务状态变更，刷新列表
   * 组件卸载时订阅自动清理，但 tracker 的 IPC 监听器继续存活
   */
  const { version } = useTaskState()

  useEffect(() => {
    refresh()
  }, [version, refresh])

  /**
   * 从 TaskStateTracker 获取当前展开任务的实时日志缓冲区，
   * 当有新的日志到达时追加到 logs 状态中
   */
  const liveLogs = useTaskLogBuffer(expandedId)
  const liveLogsLenRef = useRef(0)

  useEffect(() => {
    if (!expandedId || liveLogs.length === 0) return
    // 只在缓冲区有新条目时追加（避免重复设置）
    if (liveLogs.length > liveLogsLenRef.current) {
      const newEntries = liveLogs.slice(liveLogsLenRef.current)
      liveLogsLenRef.current = liveLogs.length
      setLogs((prev) => {
        const combined = [...prev, ...newEntries]
        return combined.length > 500 ? combined.slice(-500) : combined
      })
    }
  }, [expandedId, liveLogs.length, liveLogs])

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
      setDataSnapshots(new Map())
      return
    }
    setExpandedId(taskId)
    setTab('logs')
    setLogsLoading(true)
    setLogs([])
    liveLogsLenRef.current = 0
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
        // 优先使用 InstalledScript.schema
        let schemaSource: unknown = script.schema

        if (typeof schemaSource === 'string') {
          try { schemaSource = JSON.parse(schemaSource) } catch { schemaSource = null }
        }
        let fieldsToSet: FieldMeta[] = []
        const schemaObj = (schemaSource || {}) as Record<string, unknown>

        if (schemaObj.type === 'object' && schemaObj.properties) {
          fieldsToSet = jsonSchemaToFieldMeta(schemaObj)
        } else if (schemaObj.fields && Array.isArray(schemaObj.fields)) {
          const validTypes = new Set(['string', 'number', 'boolean', 'select', 'multiselect'])
          const raw = schemaObj.fields as Array<Record<string, unknown>>
          const validated: FieldMeta[] = []
          for (const item of raw) {
            if (typeof item.name === 'string' && validTypes.has(item.type as string)) {
              validated.push(item as unknown as FieldMeta)
            } else {
              console.warn('[Tasks] Skipping invalid schema.fields entry:', item)
            }
          }
          fieldsToSet = validated
        } else {
          // 兜底：尝试从 TaskTemplate.manifest 读取 schema
          console.warn('[Tasks] InstalledScript.schema missing or invalid, trying task template manifest')
        }
        setFormFields(fieldsToSet)
        const defaults: Record<string, unknown> = {}
        for (const f of fieldsToSet) {
          if (f.defaultValue !== undefined) defaults[f.name] = f.defaultValue
        }
        setFormValues(defaults)
      } catch (err) {
        console.error('[Tasks] Failed to parse script schema:', err)
        setFormFields([])
        setFormValues({})
      }
      loadDataForRequirements(script)
    } else {
      setSelectedScript(null)
      setFormFields([])
      setFormValues({})
      setNewScriptFolder('')
      setDataRequirements([])
      setDataMap(new Map())
      setSelections(new Map())
      setBatchMode(false)
    }
  }

  const loadDataForRequirements = async (script: InstalledScript): Promise<void> => {
    try {
      const tmpl = await taskTemplateApi.get(script.id)
      const manifest = tmpl?.manifest as Record<string, unknown> | undefined

      // 兜底：如果 handleScriptSelect 没能从 InstalledScript.schema 解析出表单字段，
      // 从 TaskTemplate.manifest.schema 再试一次
      if (manifest?.schema) {
        const mSchema = manifest.schema as Record<string, unknown>
        if (mSchema.type === 'object' && mSchema.properties) {
          const fields = jsonSchemaToFieldMeta(mSchema)
          if (fields.length > 0) {
            setFormFields(fields)
            const defaults: Record<string, unknown> = {}
            for (const f of fields) {
              if (f.defaultValue !== undefined) defaults[f.name] = f.defaultValue
            }
            setFormValues(defaults)
          }
          // fields.length === 0: keep what handleScriptSelect set
        }
        // mSchema.type !== 'object': keep what handleScriptSelect set
      } else {
        // No manifest schema: keep whatever handleScriptSelect set from script.schema
      }

      const reqs = manifest?.dataRequirements as DataRequirement[] | undefined
      if (!reqs || reqs.length === 0) {
        setDataRequirements([])
        setDataMap(new Map())
        setSelections(new Map())
        return
      }

      setDataRequirements(reqs)

      const newDataMap = new Map<string, DataForRequirement>()
      const newSelections = new Map<string, RequirementSelection>()

      for (const req of reqs) {
        const entry: DataForRequirement = { requirementKey: req.key }

        if (req.source === 'wallet') {
          const walletsRes = await walletApi.list(1, 99999)
          entry.wallets = walletsRes.items.filter(
            (w: Wallet) => w.walletType === req.templateType || req.templateType === '*'
          )
        } else if (req.source === 'proxy') {
          const proxiesRes = await proxyApi.list(1, 99999)
          entry.proxies = proxiesRes.items.filter(
            (p: Proxy) =>
              req.templateType === '*' || p.protocol === req.templateType || p.format === req.templateType
          )
        } else if (req.source === 'script_param') {
          const paramsRes = await scriptParamApi.list(1, 99999)
          entry.scriptParams = (paramsRes.items || []).filter(
            (a: ScriptParam) => a.templateId === req.templateType
          )

        }

        newDataMap.set(req.key, entry)
        newSelections.set(req.key, { key: req.key, selectedIds: new Set(), poolFilter: '' })
      }

      setDataMap(newDataMap)
      setSelections(newSelections)
    } catch (e: unknown) {
      showError(t('common.operationFailed') + ': ' + String(e))
      setDataRequirements([])
      setDataMap(new Map())
      setSelections(new Map())
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

    // 校验数据需求模板是否已安装
    if (dataRequirements.length > 0) {
      try {
        const installed = await templateApi.list(1, 9999)
        const installedIds = new Set(installed.items.map((t) => t.id))
        const missing = dataRequirements
          .filter((r) => r.source === 'script_param')
          .map((r) => r.templateType)
          .filter((id) => !installedIds.has(id))
        if (missing.length > 0) {
          showError(t('tasks.missingTemplates', { ids: missing.join(', ') }))
          return
        }
      } catch (e: unknown) {
        showError(t('common.operationFailed') + ': ' + String(e))
        return
      }
    }

    const rawConfig = formFields.length > 0 ? formValues : {}
    const config = unflattenDotNotation(rawConfig)

    if (batchMode && hasAnySelection() && dataRequirements.length > 0) {
      await createBatchTasks(config)
    } else {
      await createSingleTask(config)
    }
  }

  /** 检查是否有任何数据需求被选中 */
  const hasAnySelection = (): boolean => {
    for (const sel of selections.values()) {
      if (sel.selectedIds.size > 0) return true
    }
    return false
  }

  const createSingleTask = async (config: Record<string, unknown>): Promise<void> => {
    const finalConfig = injectDataSelections(config)
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

  const createBatchTasks = async (config: Record<string, unknown>): Promise<void> => {
    setCreating(true)
    // 收集所有选中数据的笛卡尔积组合
    const selectedByReq: Array<Array<{ key: string; id: string }>> = []
    for (const req of dataRequirements) {
      const sel = selections.get(req.key)
      if (!sel || sel.selectedIds.size === 0) continue
      const items: Array<{ key: string; id: string }> = []
      for (const id of sel.selectedIds) {
        items.push({ key: req.key, id })
      }
      selectedByReq.push(items)
    }

    if (selectedByReq.length === 0) {
      await createSingleTask(config)
      return
    }

    // 笛卡尔积展开
    const combinations = cartesianProduct(selectedByReq)

    let created = 0
    try {
      for (const combo of combinations) {
        const taskConfig = { ...config }
        for (const { key, id } of combo) {
          const req = dataRequirements.find((r) => r.key === key)
          if (!req) continue
          const data = dataMap.get(key)
          if (!data) continue

          // 查找具体数据条目
          if (req.source === 'wallet' && data.wallets) {
            const wallet = data.wallets.find((w) => w.id === id)
            if (wallet) {
              taskConfig[`_data_${key}`] = {
                id: wallet.id, address: wallet.address, walletType: wallet.walletType
              }
            }
          } else if (req.source === 'proxy' && data.proxies) {
            const proxy = data.proxies.find((p) => p.id === id)
            if (proxy) {
              taskConfig[`_data_${key}`] = {
                id: proxy.id, host: proxy.host, port: proxy.port,
                protocol: proxy.protocol, username: proxy.username, password: proxy.password
              }
            }
          } else if (req.source === 'script_param' && data.scriptParams) {
            const param = data.scriptParams.find((p) => p.id === id)
            if (param) {
              taskConfig[`_data_${key}`] = {
                id: param.id, templateId: param.templateId, data: param.data,
                pool: param.pool, labels: param.labels, notes: param.notes
              }
            }
          }
        }
        await taskApi.create({ scriptFolder: newScriptFolder, config: taskConfig, isSandbox: newIsSandbox })
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
        showSuccess(t('tasks.batchCreatedPartial', { created, total: combinations.length }))
      } else {
        showError(e instanceof Error ? e.message : String(e))
      }
    } finally {
      setCreating(false)
    }
  }

  /** 将数据需求选择注入到 task.config._data */
  const injectDataSelections = (config: Record<string, unknown>): Record<string, unknown> => {
    if (dataRequirements.length === 0 || selections.size === 0) return config
    const result = { ...config }
    for (const req of dataRequirements) {
      const sel = selections.get(req.key)
      if (!sel || sel.selectedIds.size === 0) continue
      const data = dataMap.get(req.key)
      if (!data) continue

      const selectedItems: Record<string, unknown>[] = []
      for (const id of sel.selectedIds) {
        if (req.source === 'wallet' && data.wallets) {
          const w = data.wallets.find((x) => x.id === id)
          if (w) selectedItems.push({ id: w.id, address: w.address, walletType: w.walletType })
        } else if (req.source === 'proxy' && data.proxies) {
          const p = data.proxies.find((x) => x.id === id)
          if (p) selectedItems.push({ id: p.id, host: p.host, port: p.port, protocol: p.protocol })
        } else if (req.source === 'script_param' && data.scriptParams) {
          const a = data.scriptParams.find((x) => x.id === id)
          if (a) selectedItems.push({ id: a.id, templateId: a.templateId, data: a.data, pool: a.pool })
        }
      }
      if (selectedItems.length > 0) {
        result[`_data_${req.key}`] = selectedItems
      }
    }
    return result
  }

  const resetCreateForm = (): void => {
    setNewScriptFolder('')
    setSelectedScript(null)
    setFormFields([])
    setFormValues({})
    setDataRequirements([])
    setDataMap(new Map())
    setSelections(new Map())
    setBatchMode(false)
    setNewIsSandbox(false)
  }

  // ============================================================
  // 数据需求选择回调
  // ============================================================

  const handleToggleItem = (reqKey: string, itemId: string): void => {
    setSelections((prev) => {
      const next = new Map(prev)
      const existing = next.get(reqKey)
      if (!existing) return prev
      const newSelectedIds = new Set(existing.selectedIds)
      if (newSelectedIds.has(itemId)) newSelectedIds.delete(itemId)
      else newSelectedIds.add(itemId)
      next.set(reqKey, { ...existing, selectedIds: newSelectedIds })
      return next
    })
  }

  const handleToggleAll = (reqKey: string): void => {
    setSelections((prev) => {
      const next = new Map(prev)
      const existing = next.get(reqKey)
      const data = dataMap.get(reqKey)
      if (!existing || !data) return prev
      const rows =
        data.wallets || data.proxies || data.scriptParams || []
      const allIds = rows.map((r: { id: string }) => r.id)
      const allSelected = allIds.every((id: string) => existing.selectedIds.has(id))
      next.set(reqKey, {
        ...existing,
        selectedIds: allSelected ? new Set() : new Set(allIds)
      })
      return next
    })
  }

  const handlePoolFilterChange = (reqKey: string, pool: string): void => {
    setSelections((prev) => {
      const next = new Map(prev)
      const existing = next.get(reqKey)
      if (!existing) return prev
      next.set(reqKey, { ...existing, poolFilter: pool })
      return next
    })
  }

  /** 统计总选中数量 */
  const countTotalSelections = (): number => {
    let count = 0
    for (const sel of selections.values()) {
      count += sel.selectedIds.size
    }
    return count
  }

  /** 笛卡尔积 */
  const cartesianProduct = <T,>(arrays: T[][]): T[][] => {
    return arrays.reduce<T[][]>(
      (acc, curr) => acc.flatMap((a) => curr.map((c) => [...a, c])),
      [[]]
    )
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

  /** 根据 task.scriptFolder 查找已安装脚本名称，找不到则取路径 basename */
  const getScriptName = (task: Task): string => {
    const match = installedScripts.find((s) => s.installPath === task.scriptFolder)
    if (match) return match.name
    // Fallback: extract basename from path
    const segments = task.scriptFolder.replace(/\\/g, '/').split('/')
    return segments[segments.length - 1] || task.scriptFolder
  }

  /** 生成任务配置摘要：统计引用的 account pool / 代理 / 钱包数量，截断 30 字符 */
  const getConfigSummary = (task: Task): string => {
    const parts: string[] = []
    if (task.config && typeof task.config === 'object') {
      for (const key of Object.keys(task.config)) {
        if (key.startsWith('_data_')) {
          const val = task.config[key]
          if (val && typeof val === 'object') {
            // _data_* entries typically have entries/items or pool info
            const d = val as Record<string, unknown>
            if (d.pool && typeof d.pool === 'string') {
              parts.push(d.pool)
            }
            if (d.selectedIds && Array.isArray(d.selectedIds)) {
              parts.push(`(${d.selectedIds.length})`)
            }
          }
        }
      }
      // Also count top-level simple config value indicators
      const proxyKeys = Object.keys(task.config).filter(
        (k) => k === 'proxyCount' || k === 'proxies' || k === '_data_proxy'
      )
      const walletKeys = Object.keys(task.config).filter(
        (k) => k === 'walletCount' || k === 'wallets' || k === '_data_wallet'
      )
      if (proxyKeys.length > 0) parts.push(t('proxies.title'))
      if (walletKeys.length > 0) parts.push('wallets')
    }
    if (parts.length === 0) return '—'
    const text = parts.join(', ')
    return text.length > 30 ? text.slice(0, 30) + '…' : text
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
                <th className="px-4 py-3 w-10 text-center">
                  <button
                    onClick={toggleSelectAll}
                    className="text-text-muted hover:text-text-primary transition-colors"
                    aria-label={t('common.selectAll')}
                  >
                    {allSelected ? <CheckSquareIcon size={16} /> : <SquareIcon size={16} />}
                  </button>
                </th>
                <th className="px-4 py-3 font-medium text-text-muted text-center w-[100px]">{t('common.status')}</th>
                <th className="px-4 py-3 font-medium text-text-muted text-center w-[120px]">{t('tasks.scriptName')}</th>
                <th className="px-4 py-3 font-medium text-text-muted text-center min-w-[120px]">{t('tasks.configSummary')}</th>
                <th className="px-4 py-3 font-medium text-text-muted text-center w-[160px]">{t('tasks.startTime')}</th>
                <th className="px-4 py-3 font-medium text-text-muted text-center w-[160px]">{t('tasks.endTime')}</th>
                <th className="px-4 py-3 font-medium text-text-muted text-center flex-1">
                  {t('tasks.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((task) => (
                <tr key={task.id} className="border-b border-border-light/50">
                    <td colSpan={7} className="p-0">
                    <div
                      onClick={() => handleToggleExpand(task.id)}
                      className="flex items-center cursor-pointer hover:bg-bg-card-hover transition-colors"
                    >
                      <div
                        className="px-4 py-3 w-10 shrink-0 flex items-center justify-center"
                        onClick={(e) => e.stopPropagation()}
                      >
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
                      <div className="px-4 py-3 w-[100px] shrink-0 flex items-center justify-center">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-status-${task.status}-bg text-status-${task.status}-text`}
                        >
                          {task.status === 'running' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                          )}
                          {t(`tasks.status.${task.status}`)}
                        </span>
                      </div>
                      <div className="px-4 py-3 w-[120px] shrink-0 text-text-secondary text-xs text-center truncate" title={getScriptName(task)}>
                        {getScriptName(task)}
                      </div>
                      <div className="px-4 py-3 min-w-[120px] shrink-0 text-text-secondary text-xs text-center truncate" title={getConfigSummary(task)}>
                        {getConfigSummary(task)}
                      </div>
                      <div className="px-4 py-3 w-[160px] shrink-0 text-text-secondary text-xs text-center">
                        {formatTime(task.startedAt)}
                      </div>
                      <div className="px-4 py-3 w-[160px] shrink-0 text-text-secondary text-xs text-center">
                        {formatTime(task.endedAt)}
                      </div>
                      <div
                        className="px-4 py-3 flex-1 flex items-center justify-center gap-1"
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
                        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border-light">
                          <button
                            onClick={() => setTab('logs')}
                            className={`text-xs px-2 py-1 rounded transition-colors ${
                              tab === 'logs' ? 'bg-primary/10 text-primary font-medium' : 'text-text-muted hover:text-text-secondary'
                            }`}
                          >
                            <FileText size={12} className="inline mr-1" />{t('tasks.logs')}
                          </button>
                          <button
                            onClick={() => setTab('data')}
                            className={`text-xs px-2 py-1 rounded transition-colors ${
                              tab === 'data' ? 'bg-primary/10 text-primary font-medium' : 'text-text-muted hover:text-text-secondary'
                            }`}
                          >
                            Data ({dataSnapshots.size})
                          </button>
                          <button
                            onClick={() => setTab('output')}
                            className={`text-xs px-2 py-1 rounded transition-colors ${
                              tab === 'output' ? 'bg-primary/10 text-primary font-medium' : 'text-text-muted hover:text-text-secondary'
                            }`}
                          >
                            Output
                          </button>
                        </div>
                        {tab === 'logs' && (
                          <>
                            <div className="flex items-center justify-between px-4 py-2">
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
                                <div className="text-xs text-text-muted py-2">{t('common.loading')}</div>
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
                                        <span className={`shrink-0 w-10 ${LOG_LEVEL_STYLES[log.level]}`}>
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
                          </>
                        )}
                        {tab === 'data' && (
                          <div className="max-h-64 overflow-y-auto px-4 py-2">
                            {dataSnapshots.size === 0 ? (
                              <div className="text-xs text-text-muted py-2">No data snapshots</div>
                            ) : (
                              <div className="space-y-2">
                                {Array.from(dataSnapshots.values()).map((snap) => (
                                  <div key={snap.key} className="border border-border-light rounded p-2 bg-bg-card">
                                    <span className="text-xs font-medium mb-1 block">{snap.label ?? snap.key}</span>
                                    <DataViewer snap={snap} />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {tab === 'output' && (
                          <div className="max-h-64 overflow-y-auto px-4 py-2">
                            <div className="text-xs text-text-muted py-2">Task output info</div>
                          </div>
                        )}
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
          {dataRequirements.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-secondary">
                  {t('dataRequirement.title')}
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
              <DataRequirementPanel
                requirements={dataRequirements}
                dataMap={dataMap}
                selections={selections}
                onToggleItem={handleToggleItem}
                onToggleAll={handleToggleAll}
                onPoolFilterChange={handlePoolFilterChange}
              />
              {!batchMode && hasAnySelection() && (
                <div className="text-xs text-text-muted">
                  {t('tasks.selectedAccounts', { count: countTotalSelections() })}
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

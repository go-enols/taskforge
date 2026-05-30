import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Play, Square, RefreshCw, Terminal, FolderOpen, X, Bug, User, Package
} from 'lucide-react'
import { taskApi, fileApi, accountApi } from '../api'
import type { TaskLog, Task, Account } from '../types'
import { toast } from 'sonner'

const parseManifest = (raw: string): Record<string, unknown> => {
  const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  return JSON.parse(stripped)
}

export default function DebugPage() {
  const { t } = useTranslation()
  const [folderPath, setFolderPath] = useState('')
  const [folderInfo, setFolderInfo] = useState<{ name: string; entry: string; hasManifest: boolean; requiredTemplates?: string[] } | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [taskStatus, setTaskStatus] = useState<Task['status']>('idle')
  const [logs, setLogs] = useState<TaskLog[]>([])
  const [running, setRunning] = useState(false)
  const [useSandbox, setUseSandbox] = useState(true)
  const [matchedAccounts, setMatchedAccounts] = useState<Account[]>([])
  const logEndRef = useRef<HTMLDivElement | null>(null)

  const handleSelectFolder = async () => {
    const result = await fileApi.selectFolder()
    if (result.canceled || !result.folderPath) return
    const dir = result.folderPath

    setFolderPath(dir)
    setFolderInfo(null)
    setMatchedAccounts([])
    setTaskId(null)
    setTaskStatus('idle')
    setLogs([])

    let manifest: Record<string, unknown> | null = null

    // 扫描文件夹：读取 manifest.json
    try {
      const manifestRes = await fileApi.readFile(`${dir}/manifest.json`)
      if (manifestRes.success && manifestRes.content) {
        try { manifest = parseManifest(manifestRes.content) } catch (err) { console.error('[Debug] manifest parse error:', err) }
      }
    } catch (err) {
      console.error('[Debug] Failed to read manifest.json:', err)
    }

    // 也尝试 meta.json
    if (!manifest) {
      try {
        const metaRes = await fileApi.readFile(`${dir}/meta.json`)
        if (metaRes.success && metaRes.content) {
          try { manifest = parseManifest(metaRes.content) } catch (err) { console.error('[Debug] meta parse error:', err) }
        }
      } catch (err) {
        console.error('[Debug] Failed to read meta.json:', err)
      }
    }

    const info: { name: string; entry: string; hasManifest: boolean; requiredTemplates?: string[] } = {
      name: dir.split(/[/\\]/).pop() || 'unknown',
      entry: 'index.js',
      hasManifest: manifest !== null && 'schema' in (manifest || {})
    }

    if (manifest) {
      info.name = (manifest.name as string) || info.name
      info.entry = (manifest.entryPoint as string) || 'index.js'
      if (Array.isArray(manifest.requiredAccountTemplateIds)) {
        info.requiredTemplates = manifest.requiredAccountTemplateIds as string[]
      }
    }

    setFolderInfo(info)

    // 根据 requiredAccountTemplateIds 自动匹配账户
    if (info.requiredTemplates && info.requiredTemplates.length > 0) {
      try {
        const res = await accountApi.list(1, 9999)
        const allAccounts = res.items || []
        const matched = allAccounts.filter((a) => info.requiredTemplates!.includes(a.templateId))
        setMatchedAccounts(matched)
      } catch (err) {
        console.error('[Debug] Failed to load matched accounts:', err)
      }
    }
  }

  useEffect(() => {
    const handleStatus = (data: { id: string; status: string }) => {
      if (data.id === taskId) {
        setTaskStatus(data.status as Task['status'])
        if (data.status === 'complete' || data.status === 'error' || data.status === 'stopped') setRunning(false)
      }
    }
    const handleLog = (data: { taskId: string; logs: Array<{ level: string; message: string; timestamp: string }> }) => {
      if (data.taskId === taskId) {
        setLogs((prev) => {
          const newLogs = data.logs.map((l, i) => ({ id: -(prev.length + i), taskId: data.taskId, timestamp: l.timestamp, level: l.level as TaskLog['level'], message: l.message }))
          const combined = [...prev, ...newLogs]
          return combined.length > 1000 ? combined.slice(-1000) : combined
        })
      }
    }
    const unsub1 = window.electronAPI?.on?.('task:statusChanged', (data) =>
      handleStatus(data as { id: string; status: string })
    )
    const unsub2 = window.electronAPI?.on?.('task:log', (data) =>
      handleLog(
        data as { taskId: string; logs: Array<{ level: string; message: string; timestamp: string }> }
      )
    )
    return () => {
      if (typeof unsub1 === 'function') unsub1()
      if (typeof unsub2 === 'function') unsub2()
    }
  }, [taskId])

  useEffect(() => {
    if (logs.length > 0) logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const handleRun = async () => {
    if (!folderPath) return
    setRunning(true)
    setLogs([])

    try {
      const config: Record<string, unknown> = {}
      if (matchedAccounts.length > 0) {
        config._accounts = matchedAccounts.map((a) => ({ id: a.id, templateId: a.templateId, data: a.data, pool: a.pool }))
        if (matchedAccounts.length === 1) {
          config._account_id = matchedAccounts[0].id
          config._account_data = matchedAccounts[0].data
          config._account_pool = matchedAccounts[0].pool
        }
      }

      const task = await taskApi.create({ scriptFolder: folderPath, config, isSandbox: useSandbox })
      setTaskId(task.id)
      setTaskStatus('running')
      await taskApi.start(task.id)
      toast.success(`调试运行: ${folderInfo?.name || folderPath}${useSandbox ? ' (沙箱)' : ''}`)
    } catch (e) {
      setRunning(false)
      toast.error(e instanceof Error ? e.message : t('common.operationFailed'))
    }
  }

  const handleStop = async () => {
    if (!taskId) return
    try { await taskApi.stop(taskId); setRunning(false) } catch (err) { console.error('[Debug] Failed to stop task:', err) }
  }

  const logLevelColor: Record<string, string> = {
    info: 'text-text-secondary', warn: 'text-warning', error: 'text-danger', debug: 'text-text-muted'
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Bug className="w-5 h-5 text-primary" />
        <h1 className="text-2xl font-bold text-text-primary">调试</h1>
        <span className="text-xs text-text-muted ml-2">选择本地项目文件夹，自动匹配账户数据</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 左侧面板 */}
        <div className="bg-bg-card rounded-xl border border-border-light p-4 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
              <FolderOpen size={14} />项目文件夹
            </h2>
            <button onClick={handleSelectFolder} disabled={running}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-border-light text-text-secondary text-sm hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-50">
              <FolderOpen size={16} />选择本地文件夹
            </button>
          </div>

          {folderPath && (
            <>
              <div className="font-mono text-xs text-text-primary bg-bg-page rounded-lg p-2 break-all">{folderPath}</div>
              {folderInfo && (
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2"><span className="text-text-muted w-10">名称:</span><span className="text-text-primary font-medium truncate">{folderInfo.name}</span></div>
                  <div className="flex items-center gap-2"><span className="text-text-muted w-10">入口:</span><span className="text-text-primary font-mono">{folderInfo.entry}</span></div>
                  <div className="flex items-center gap-2"><span className="text-text-muted w-10">配置:</span><span className={folderInfo.hasManifest ? 'text-success' : 'text-text-muted'}>{folderInfo.hasManifest ? 'manifest.json' : 'meta.json / 自动推断'}</span></div>
                  <div className="flex items-center gap-2"><span className="text-text-muted w-10">依赖:</span><Package size={12} className="text-text-muted" /><span className="text-text-muted">自动安装</span></div>
                  {folderInfo.requiredTemplates && folderInfo.requiredTemplates.length > 0 && (
                    <div className="flex items-start gap-2">
                      <span className="text-text-muted w-10 shrink-0">模板:</span>
                      <span className="text-text-primary font-mono text-[10px] leading-relaxed">{folderInfo.requiredTemplates.join(', ')}</span>
                    </div>
                  )}
                </div>
              )}
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={useSandbox} onChange={(e) => setUseSandbox(e.target.checked)} className="rounded" disabled={running} />
                <span className="text-text-secondary">沙箱模式</span>
                <span className="text-text-muted">({useSandbox ? '限制网络/文件系统' : '允许所有权限'})</span>
              </label>
            </>
          )}

          {/* 匹配的账户 */}
          {folderInfo?.requiredTemplates && folderInfo.requiredTemplates.length > 0 && (
            <div className="border-t border-border-light pt-3">
              <h2 className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
                <User size={14} />匹配账户 ({matchedAccounts.length})
              </h2>
              {matchedAccounts.length === 0 ? (
                <p className="text-xs text-text-muted">未找到匹配的账户，请先在「账户管理」中创建对应模板的账户</p>
              ) : (
                <div className="space-y-0.5 max-h-48 overflow-y-auto">
                  {matchedAccounts.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs bg-bg-page border border-border-light">
                      <span className="text-text-primary truncate flex-1">
                        {typeof a.data === 'object' && a.data ? Object.values(a.data as Record<string, unknown>).slice(0, 2).join(' / ') : a.id.slice(0, 8)}
                      </span>
                      <span className="text-text-muted shrink-0">{a.pool}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 钱包提示 */}
          <div className="border-t border-border-light pt-3">
            <h2 className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
              <User size={14} />钱包数据
            </h2>
            <p className="text-xs text-text-muted">钱包数据通过 <code className="text-primary">TASK_WALLETS</code> 环境变量自动注入</p>
          </div>
        </div>

        {/* 日志面板 */}
        <div className="lg:col-span-2 bg-bg-card rounded-xl border border-border-light p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Terminal size={14} />运行日志
              {taskStatus === 'running' && <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />}
            </h2>
            <div className="flex items-center gap-2">
              {taskStatus && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  taskStatus === 'running' ? 'bg-primary/10 text-primary' : taskStatus === 'complete' ? 'bg-success/10 text-success' : taskStatus === 'error' ? 'bg-danger/10 text-danger' : 'bg-bg-tertiary text-text-muted'}`}>
                  {taskStatus}
                </span>
              )}
              {running ? (
                <button onClick={handleStop} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-danger text-white text-xs hover:bg-danger-hover transition-colors">
                  <Square size={12} />停止
                </button>
              ) : (
                <button onClick={handleRun} disabled={!folderPath}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-white text-xs hover:bg-primary-hover disabled:opacity-50 transition-colors">
                  <Play size={12} />运行
                </button>
              )}
              <button onClick={() => setLogs([])}
                className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-bg-tertiary transition-colors" title="清空日志">
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="flex-1 bg-[#1a1a2e] rounded-lg p-3 font-mono text-xs overflow-y-auto max-h-[65vh] min-h-[200px]">
            {logs.length === 0 ? (
              <div className="text-text-muted flex items-center justify-center h-full">
                {running ? (<span className="flex items-center gap-2"><RefreshCw size={12} className="animate-spin" />等待输出...</span>) : '选择一个文件夹并点击「运行」开始调试'}
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className={`flex gap-2 leading-relaxed ${logLevelColor[log.level] || 'text-text-secondary'}`}>
                  <span className="text-text-muted shrink-0 w-20">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  <span className="shrink-0 w-12 text-right text-[10px] uppercase opacity-60">{log.level}</span>
                  <span className="break-all">{log.message}</span>
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </div>
  )
}

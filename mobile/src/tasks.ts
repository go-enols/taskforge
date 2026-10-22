/**
 * @file 本机脚本任务管理（仅 Android App）
 * @description 从 Marketplace 下载脚本 zip → 在 WebView 内解压 → 通过 Node 运行时写入应用私有目录 →
 *              运行/停止脚本并接收日志。任务元数据存 localStorage，脚本文件由 Node 侧持久化。
 * @module mobile/src/tasks
 */
import JSZip from 'jszip'
import JSON5 from 'json5'
import { scriptApi, type ScriptItem } from './api'
import { nodeRpc } from './native'

/** 已安装到手机的脚本任务 */
export interface InstalledTask {
  id: string
  name: string
  version: string
  entryPoint: string
  marketplaceId?: string | null
  installedAt?: string
  manifest?: Record<string, unknown>
  schema?: Record<string, unknown>
  permissions?: string[]
}

export interface TaskLogEntry {
  taskId: string
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  timestamp: string
}

const TASKS_KEY = 'tf_mobile_tasks'
const CONFIG_PREFIX = 'tf_mobile_task_config_'

/** 读取本机已安装任务列表 */
export function listInstalledTasks(): InstalledTask[] {
  try {
    const raw = localStorage.getItem(TASKS_KEY)
    const parsed = raw ? (JSON.parse(raw) as InstalledTask[]) : []
    return Array.isArray(parsed) ? parsed.filter((task) => task && typeof task.id === 'string') : []
  } catch {
    return []
  }
}

function saveTasks(tasks: InstalledTask[]): void {
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks))
}

/** 保存/更新单个任务元数据 */
export function upsertInstalledTask(task: InstalledTask): void {
  const tasks = listInstalledTasks().filter((item) => item.id !== task.id)
  tasks.unshift(task)
  saveTasks(tasks)
}

/** 删除任务元数据 */
export function removeInstalledTaskMeta(taskId: string): void {
  saveTasks(listInstalledTasks().filter((item) => item.id !== taskId))
  localStorage.removeItem(CONFIG_PREFIX + taskId)
}

/** 读取任务配置（上次运行时的参数） */
export function loadTaskConfig(taskId: string): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(CONFIG_PREFIX + taskId)
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** 保存任务配置 */
export function saveTaskConfig(taskId: string, config: Record<string, unknown>): void {
  localStorage.setItem(CONFIG_PREFIX + taskId, JSON.stringify(config))
}

/** 校验文件相对路径，拒绝 zip-slip */
function isSafePath(relPath: string): boolean {
  if (!relPath || relPath.startsWith('/') || /^[A-Za-z]:/.test(relPath)) return false
  return !relPath
    .replace(/\\/g, '/')
    .split('/')
    .some((part) => part === '..' || part === '')
}

interface ManifestShape {
  id?: string
  name?: string
  version?: string
  description?: string
  entryPoint?: string
  runtime?: string
  schema?: Record<string, unknown>
  permissions?: string[]
  tags?: string[]
  changelog?: string
}

/**
 * 从 Marketplace 脚本条目安装到本机
 * @param script - 市场脚本元数据
 * @returns 安装后的任务
 */
export async function installScriptToDevice(script: ScriptItem): Promise<InstalledTask> {
  const blob = await scriptApi.fetchZip(script.id)
  const zip = await JSZip.loadAsync(blob)
  const manifestFile = zip.file('manifest.json')
  if (!manifestFile) throw new Error('脚本包缺少 manifest.json')

  let manifest: ManifestShape
  try {
    manifest = JSON5.parse(await manifestFile.async('string')) as ManifestShape
  } catch {
    throw new Error('manifest.json 解析失败')
  }
  if (!manifest.entryPoint || typeof manifest.entryPoint !== 'string') {
    throw new Error('manifest 缺少 entryPoint')
  }
  if (!/\.(js|cjs|mjs)$/i.test(manifest.entryPoint)) {
    throw new Error('入口文件必须是 .js / .cjs / .mjs')
  }

  const files: Array<{ path: string; data: string }> = []
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue
    if (!isSafePath(entry.name)) continue
    const data = await entry.async('base64')
    files.push({ path: entry.name, data })
  }
  if (files.length === 0) throw new Error('脚本包为空')

  const taskId = script.id
  await nodeRpc({
    cmd: 'install',
    taskId,
    name: manifest.name || script.name,
    version: manifest.version || script.version,
    entryPoint: manifest.entryPoint,
    manifest,
    marketplaceId: script.id,
    files
  })

  const task: InstalledTask = {
    id: taskId,
    name: manifest.name || script.name,
    version: manifest.version || script.version,
    entryPoint: manifest.entryPoint,
    marketplaceId: script.id,
    installedAt: new Date().toISOString(),
    manifest: manifest as Record<string, unknown>,
    schema: (manifest.schema as Record<string, unknown>) || script.schema,
    permissions: Array.isArray(manifest.permissions) ? manifest.permissions : []
  }
  upsertInstalledTask(task)
  return task
}

/** 在手机上运行脚本任务 */
export async function runInstalledTask(
  task: InstalledTask,
  config: Record<string, unknown>,
  sandbox: boolean
): Promise<void> {
  saveTaskConfig(task.id, config)
  await nodeRpc(
    {
      cmd: 'run',
      taskId: task.id,
      config,
      sandbox,
      permissions: task.permissions || []
    },
    20000
  )
}

/** 停止任务 */
export async function stopInstalledTask(taskId: string): Promise<void> {
  await nodeRpc({ cmd: 'stop', taskId }, 15000)
}

/** 删除本机任务（含脚本文件） */
export async function deleteInstalledTask(taskId: string): Promise<void> {
  await nodeRpc({ cmd: 'remove', taskId }, 15000)
  removeInstalledTaskMeta(taskId)
}

/** 以 Node 运行时文件系统为准同步任务列表（恢复 App 后被清理的 localStorage 等场景） */
export async function syncTasksFromRuntime(): Promise<InstalledTask[]> {
  const result = await nodeRpc<{ items: InstalledTask[] }>({ cmd: 'list' }, 15000)
  const runtimeTasks = Array.isArray(result.items) ? result.items : []
  const merged = runtimeTasks.map((task) => ({
    id: task.id,
    name: task.name,
    version: task.version,
    entryPoint: task.entryPoint,
    marketplaceId: task.marketplaceId ?? null,
    installedAt: task.installedAt,
    manifest: task.manifest,
    schema: (task.manifest?.schema as Record<string, unknown>) || undefined,
    permissions: Array.isArray(task.manifest?.permissions) ? (task.manifest.permissions as string[]) : []
  }))
  saveTasks(merged)
  return merged
}

/** 运行状态 */
export type TaskRunStatus = 'idle' | 'running' | 'exited' | 'stopped' | 'error'

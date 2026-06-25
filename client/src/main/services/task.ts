import { spawn, ChildProcess, exec } from 'child_process'
import { promisify } from 'util'
const execAsync = promisify(exec)
import { join, resolve as resolvePath } from 'path'
import { existsSync, readFileSync, statSync } from 'fs'
import { app } from 'electron'
import { createLogger } from '../utils/logger'
import { LogBuffer } from '../utils/log-buffer'
import type { LogEntry } from '../utils/log-buffer'
import { SdkLineParser, type DataView } from './sdk-protocol'
import type { StoreService } from './store'
import type { TaskOutput, TaskLogBatch, PermissionSet, DataSnapshot } from '../../shared/types'
import { estimateSize, MAX_SNAPSHOT_SIZE } from '../../shared/utils/type-guards'

export type RendererSender = (channel: string, data: unknown) => void

interface TaskServiceOptions {
  rendererSender?: RendererSender
}

interface TaskProgress {
  percent: number
  message: string
}

interface RunningTask {
  process: ChildProcess | null
  status: 'running' | 'paused'
  progress: TaskProgress
  logBuffer: LogBuffer
  isSoftPaused: boolean
  startedAt: number
  stdout: string
  stderr: string
}

const MAX_COMPLETED_OUTPUTS = 100

export class TaskService {
  private runningTasks = new Map<string, RunningTask>()
  private completedOutputs = new Map<string, TaskOutput>()
  private dataSnapshots = new Map<string, DataSnapshot>()
  private rendererSender: RendererSender | undefined
  private scriptsDir: string

  constructor(
    private store: StoreService,
    options?: TaskServiceOptions
  ) {
    this.rendererSender = options?.rendererSender
    this.scriptsDir = join(app.getPath('userData'), 'scripts')
  }

  private async installDependencies(cwd: string, running: RunningTask): Promise<void> {
    const pkgPath = join(cwd, 'package.json')
    if (!existsSync(pkgPath)) return

    const nmPath = join(cwd, 'node_modules')
    const nmExists = existsSync(nmPath)

    if (nmExists) {
      const pkgStat = statSync(pkgPath)
      const nmStat = statSync(nmPath)

      // If node_modules is newer than package.json AND all declared
      // dependencies actually exist on disk, skip install.
      if (pkgStat.mtimeMs < nmStat.mtimeMs) {
        if (this.areAllDepsInstalled(pkgPath, nmPath)) return
        running.logBuffer.push('warn', 'node_modules 不完整（部分依赖缺失），将重新安装...')
      } else {
        running.logBuffer.push('info', 'package.json 已更新，重新安装依赖...')
      }
    } else {
      running.logBuffer.push('info', '检测到 package.json，正在安装依赖...')
    }

    try {
      await execAsync('npm install --omit=dev --no-audit --no-fund', {
        cwd,
        timeout: 180000
      })
      running.logBuffer.push('info', '依赖安装完成')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`依赖安装失败: ${msg}`)
    }
  }

  /**
   * Verify that every dependency declared in package.json's "dependencies"
   * has a corresponding directory inside node_modules.
   * Returns false if any declared package is missing, true otherwise.
   */
  private areAllDepsInstalled(pkgPath: string, nmPath: string): boolean {
    try {
      const raw = readFileSync(pkgPath, 'utf-8')
      const pkg = JSON.parse(raw) as Record<string, unknown>
      const deps = pkg.dependencies as Record<string, string> | undefined
      if (!deps || Object.keys(deps).length === 0) return true

      for (const name of Object.keys(deps)) {
        // Scoped packages like "@scope/name" need a directory at node_modules/@scope/name
        const depDir = join(nmPath, name)
        if (!existsSync(depDir)) return false
      }
      return true
    } catch {
      // If we can't read/parse package.json, assume deps are missing (safer)
      return false
    }
  }

  async startTask(id: string): Promise<void> {
    const task = this.store.taskRepo.getTask(id)
    if (!task) throw new Error('Task not found')
    if (this.runningTasks.has(id)) throw new Error('Task is already running')
    if (task.status === 'running') throw new Error('Task is already running')

    // 每次任务开始时清空之前的 data snapshots
    this.dataSnapshots.clear()

    this.store.taskRepo.updateTask(id, { status: 'running', startedAt: new Date().toISOString() })

    const logBuffer = new LogBuffer((lines: LogEntry[]) => {
      const batch: TaskLogBatch = { taskId: id, logs: lines }
      this.sendToRenderer('task:log', batch)
      for (const line of lines) {
        this.store.taskRepo.addTaskLog(id, line.level, line.message)
      }
    })

    const running: RunningTask = {
      process: null,
      status: 'running',
      progress: { percent: 0, message: 'Starting...' },
      logBuffer,
      isSoftPaused: false,
      startedAt: Date.now(),
      stdout: '',
      stderr: ''
    }

    this.runningTasks.set(id, running)

    try {
      const scriptPath = task.scriptFolder
      if (!existsSync(scriptPath)) {
        const localPath = join(this.scriptsDir, scriptPath)
        if (!existsSync(localPath)) {
          throw new Error(`Script not found: ${scriptPath}. The script may have been removed.`)
        }
      }

      const resolvedPath = existsSync(scriptPath) ? scriptPath : join(this.scriptsDir, scriptPath)
      const isDirectory = statSync(resolvedPath).isDirectory()
      let entryPoint = resolvedPath
      let cwd = resolvedPath

      let scriptPermissions: PermissionSet = { network: false, filesystem: false }

      if (isDirectory) {
        cwd = resolvedPath
        const metaPath = join(resolvedPath, 'meta.json')
        if (existsSync(metaPath)) {
          const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
          entryPoint = meta.entryPoint
            ? join(resolvedPath, meta.entryPoint)
            : join(resolvedPath, 'index.js')
          // 读取脚本声明的运行时权限（向后兼容：旧版 meta.json 无此字段）
          if (meta.permissions) {
            scriptPermissions = meta.permissions as PermissionSet
          }
        } else {
          entryPoint = join(resolvedPath, 'index.js')
        }
      }

      if (!existsSync(entryPoint)) {
        throw new Error(
          `Entry point not found: ${entryPoint}. The script may be corrupted or incompletely installed.`
        )
      }

      await this.installDependencies(cwd, running)

      // ── 权限控制：三层模型 ──────────────────────────────────
      // Layer 1: manifest.permissions — 脚本声明的权限
      // Layer 2: is_sandbox       — 沙箱模式覆盖，所有权限被拒绝
      // Layer 3: 系统关键环境变量白名单 — path/home/shell 等
      //          只能从父进程继承，绝不可被 task.config 覆盖
      // ─────────────────────────────────────────────────────────

      // Layer 1+2: 计算生效权限
      const effectivePermissions: PermissionSet = task.isSandbox
        ? { network: false, filesystem: false }
        : scriptPermissions

      // Layer 3: 系统关键变量白名单（配置中的这些键会被阻止）
      const SYSTEM_PROTECTED_KEYS = new Set([
        'PATH',
        'HOME',
        'USERPROFILE',
        'APPDATA',
        'TEMP',
        'TMP',
        'SHELL',
        'USER',
        'LOGNAME',
        'LANG',
        'TERM',
        'LD_LIBRARY_PATH',
        'LD_PRELOAD',
        'DYLD_LIBRARY_PATH',
        'PYTHONPATH',
        'CLASSPATH'
      ])

      // 构建子进程环境变量
      const env: Record<string, string> = {}

      // ① 注入 task.config 中的自定义配置（受白名单限制）
      for (const [key, value] of Object.entries(task.config)) {
        if (value === undefined || value === null) continue
        if (key === 'args' || key === '_command') continue
        if (key.startsWith('_data_')) continue
        const envKey = `TASK_${key.toUpperCase()}`
        if (SYSTEM_PROTECTED_KEYS.has(envKey)) continue
        env[envKey] = typeof value === 'object' ? JSON.stringify(value) : String(value)
      }

      // ② 继承系统基础设施变量（安全值来自父进程，不可被 config 覆盖）
      env['PATH'] = process.env.PATH ?? ''
      env['HOME'] = process.env.HOME ?? ''
      env['USERPROFILE'] = process.env.USERPROFILE ?? ''
      env['APPDATA'] = process.env.APPDATA ?? ''
      env['TEMP'] = process.env.TEMP ?? ''
      env['TMP'] = process.env.TMP ?? ''

      // ③ 注入权限元信息供脚本运行时自检
      env['TASK_ID'] = id
      env['TASK_CONFIG'] = JSON.stringify(task.config)
      env['TASK_PERM_NETWORK'] = effectivePermissions.network ? '1' : '0'
      env['TASK_PERM_FILESYSTEM'] = effectivePermissions.filesystem ? '1' : '0'
      env['TASK_SANDBOX'] = task.isSandbox ? '1' : '0'

      // ④ 注入钱包数据（仅在有网络权限且非沙箱时注入，防止敏感数据泄露）
      if (!task.isSandbox && effectivePermissions.network) {
        try {
          const manifestPath = join(resolvedPath, 'manifest.json')
          if (existsSync(manifestPath)) {
            const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
            const reqs = manifest.dataRequirements as Array<{
              key: string; source: string; templateType: string
            }> | undefined
            if (reqs && reqs.length > 0) {
              for (const req of reqs) {
                const dataKey = `_data_${req.key}`
                const selectedData = (task.config as Record<string, unknown>)[dataKey]
                if (Array.isArray(selectedData) && selectedData.length > 0) {
                  env[`TASK_DATA_${req.key.toUpperCase()}`] = JSON.stringify(selectedData)
                }
              }
            }
          }
        } catch (err) {
          createLogger('task').warn('Failed to inject data requirements', { error: String(err) })
        }
      }

      // ⑤ 注入账户数据（仅在有网络权限且非沙箱时注入）
      let command = entryPoint
      const args: string[] = []

      const isNodeFile =
        entryPoint.endsWith('.js') || entryPoint.endsWith('.mjs') || entryPoint.endsWith('.cjs')

      if (isNodeFile) {
        command = 'node'
        args.push(entryPoint)
      } else if (entryPoint.endsWith('.ts')) {
        command = 'npx'
        args.push('tsx', entryPoint)
      }

      if (task.config.args && Array.isArray(task.config.args)) {
        args.push(...(task.config.args as string[]))
      }

      // Root-level sandbox enforcement: load sandbox-enforcer.cjs via
      // NODE_OPTIONS=--require so it runs BEFORE the user's script. This
      // patches http/https/net/tls/dgram/dns/fetch/child_process/worker_threads
      // and chroots fs.* to the script's cwd + system temp dirs.
      //
      // The enforcer reads TASK_PERM_NETWORK / TASK_PERM_FILESYSTEM from
      // the env and enforces accordingly. If the script author declares
      // `permissions: ["network"]` in their manifest, the env var is set
      // to "1" and the patches are skipped. If is_sandbox=true, both are
      // set to "0" and the patches deny every operation.
      //
      // Skip the enforcer when the entry point is a tsx runner (npx tsx)
      // because NODE_OPTIONS=--require doesn't work cleanly with tsx's
      // own pre-loads; in that case the user is running their own
      // TypeScript dev script and should be in control.
      const enforcerPath = resolvePath(__dirname, 'sandbox-enforcer.cjs')

      if (existsSync(enforcerPath)) {
        const existingOpts = env.NODE_OPTIONS || ''
        env.NODE_OPTIONS = `--require ${enforcerPath}${existingOpts ? ' ' + existingOpts : ''}`
      } else {
        createLogger('task').warn('Sandbox enforcer not found at ' + enforcerPath)
      }

      const proc = spawn(command, args, {
        cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe']
      })
      // 关闭 stdin：父进程不向子进程写数据，子进程的 process.stdin.on('data',...)
      // 会阻止事件循环退出，导致任务永远不结束
      proc.stdin?.end()

      running.process = proc

      // 用 SdkLineParser 解析 stdout: 支持结构化 JSON-RPC + 兼容纯文本
      const parser = new SdkLineParser({
        logBuffer,
        onProgress: (percent, message) => {
          running.progress = { percent, message: message ?? '' }
        },
        onResult: (ok, data, error) => {
          // 脚本通过 {type:"result"} 报告最终结果, 写入日志便于用户查看
          if (ok) {
            logBuffer.push('info', `[sdk] result: ${JSON.stringify(data)}`)
            // 将 result.data 自动转换为一个 _result 数据快照
            if (data !== undefined) {
              const size = estimateSize(data)
              if (size > MAX_SNAPSHOT_SIZE) {
                logBuffer.push('warn', `[sdk] result data 超过 ${MAX_SNAPSHOT_SIZE} 字节 (${size})，已截断`)
              } else {
                const snap: DataSnapshot = {
                  key: '_result',
                  label: 'Result',
                  view: 'auto',
                  data,
                  updatedAt: Date.now()
                }
                this.dataSnapshots.set('_result', snap)
                this.sendToRenderer('task:data', snap)
              }
            }
          } else {
            logBuffer.push('error', `[sdk] result error: ${error ?? 'unknown'}`)
          }
        },
        onData: (key, label, view, data) => {
          this.handleDataSnapshot(id, key, label, view, data)
        }
      })

      proc.stdout?.on('data', (data: Buffer) => {
        if (running.isSoftPaused) return
        const text = data.toString()
        running.stdout += text
        parser.feed(text)
      })

      proc.stderr?.on('data', (data: Buffer) => {
        if (running.isSoftPaused) return
        const text = data.toString()
        running.stderr += text
        // stderr 仍按纯文本处理 (脚本 SDK 不期望从 stderr 发 JSON)
        for (const line of text.split('\n')) {
          if (line.trim()) logBuffer.push('error', line)
        }
      })

      proc.on('exit', (code) => {
        if (!this.runningTasks.has(id)) return
        parser.flush()
        logBuffer.destroy()
        const status = code === 0 ? 'complete' : 'error'
        const output: TaskOutput = {
          taskId: id,
          exitCode: code,
          stdout: running.stdout.slice(-10000),
          stderr: running.stderr.slice(-10000),
          durationMs: Date.now() - running.startedAt,
          dataSnapshots: Array.from(this.dataSnapshots.values())
        }
        this.store.taskRepo.updateTask(id, { status, endedAt: new Date().toISOString() })
        this.store.taskRepo.addTaskLog(id, 'info', `Process exited with code ${code ?? 'null'}`)
        this.sendToRenderer('task:statusChanged', { id, status })
        this.sendToRenderer('task:output', output)
        this.completedOutputs.set(id, output)
        this.trimCompletedOutputs()
        this.runningTasks.delete(id)
      })

      proc.on('error', (err) => {
        if (!this.runningTasks.has(id)) return
        logBuffer.destroy()
        this.store.taskRepo.updateTask(id, { status: 'error', endedAt: new Date().toISOString() })
        this.store.taskRepo.addTaskLog(id, 'error', `Process error: ${err.message}`)
        this.sendToRenderer('task:statusChanged', { id, status: 'error' })
        this.runningTasks.delete(id)
      })

      this.store.taskRepo.addTaskLog(id, 'info', 'Task started')
      this.sendToRenderer('task:statusChanged', { id, status: 'running' })
    } catch (err) {
      logBuffer.destroy()
      this.store.taskRepo.updateTask(id, { status: 'error', endedAt: new Date().toISOString() })
      this.store.taskRepo.addTaskLog(id, 'error', `Failed to start: ${String(err)}`)
      this.sendToRenderer('task:statusChanged', { id, status: 'error' })
      this.runningTasks.delete(id)
      throw err
    }
  }

  /**
   * 处理脚本发来的 onData 消息：按 key 覆盖存入 dataSnapshots Map，
   * 超过 MAX_SNAPSHOT_SIZE 的大数据截断并记录警告日志。
   */
  private handleDataSnapshot(taskId: string, key: string, label: string | undefined, view: DataView, data: unknown): void {
    if (!key) return
    const size = estimateSize(data)
    if (size > MAX_SNAPSHOT_SIZE) {
      this.runningTasks.get(taskId)?.logBuffer.push(
        'warn',
        `[sdk] data snapshot "${key}" 超过 ${MAX_SNAPSHOT_SIZE} 字节 (${size})，已截断`
      )
      return
    }
    const snap: DataSnapshot = { key, label, view, data, updatedAt: Date.now() }
    this.dataSnapshots.set(key, snap)
    this.sendToRenderer('task:data', snap)
  }

  async stopTask(id: string): Promise<void> {
    const running = this.runningTasks.get(id)
    if (!running) throw new Error('Task is not running')

    if (running.process?.pid) {
      try {
        running.process.kill('SIGTERM')
        setTimeout(() => {
          if (running.process?.pid) {
            running.process.kill('SIGKILL')
          }
        }, 5000)
      } catch (err) {
        createLogger('task').warn('Failed to kill process', { taskId: id, error: String(err) })
      }
    }

    running.logBuffer.destroy()
    this.runningTasks.delete(id)
    this.store.taskRepo.updateTask(id, { status: 'stopped', endedAt: new Date().toISOString() })
    this.store.taskRepo.addTaskLog(id, 'info', 'Task stopped')
    this.sendToRenderer('task:statusChanged', { id, status: 'stopped' })
  }

  async pauseTask(id: string): Promise<void> {
    const running = this.runningTasks.get(id)
    if (!running) throw new Error('Task is not running')
    if (running.status === 'paused') throw new Error('Task is already paused')

    if (process.platform !== 'win32' && running.process?.pid) {
      try {
        running.process.kill('SIGSTOP')
      } catch {
        createLogger('task').warn('SIGSTOP failed, falling back to soft pause', { taskId: id })
        running.isSoftPaused = true
        running.process?.stdout?.pause()
        running.process?.stderr?.pause()
      }
    } else {
      running.isSoftPaused = true
      running.process?.stdout?.pause()
      running.process?.stderr?.pause()
    }

    running.status = 'paused'
    this.store.taskRepo.updateTask(id, { status: 'paused' })
    this.store.taskRepo.addTaskLog(id, 'info', 'Task paused')
    this.sendToRenderer('task:statusChanged', { id, status: 'paused' })
  }

  async resumeTask(id: string): Promise<void> {
    const running = this.runningTasks.get(id)
    if (!running) throw new Error('Task is not running')
    if (running.status !== 'paused') throw new Error('Task is not paused')

    if (running.isSoftPaused) {
      running.isSoftPaused = false
      running.process?.stdout?.resume()
      running.process?.stderr?.resume()
    } else if (running.process?.pid) {
      try {
        running.process.kill('SIGCONT')
      } catch {
        createLogger('task').warn('SIGCONT failed', { taskId: id })
      }
    }

    running.status = 'running'
    this.store.taskRepo.updateTask(id, { status: 'running' })
    this.store.taskRepo.addTaskLog(id, 'info', 'Task resumed')
    this.sendToRenderer('task:statusChanged', { id, status: 'running' })
  }

  getTaskProgress(id: string): TaskProgress | null {
    return this.runningTasks.get(id)?.progress ?? null
  }

  getTaskOutput(id: string): TaskOutput | null {
    const completed = this.completedOutputs.get(id)
    if (completed) return completed
    const running = this.runningTasks.get(id)
    if (!running) return null
    return {
      taskId: id,
      exitCode: null,
      stdout: running.stdout.slice(-10000),
      stderr: running.stderr.slice(-10000),
      durationMs: Date.now() - running.startedAt,
      dataSnapshots: []
    }
  }

  cleanOrphanTasks(): void {
    const tasks = this.store.taskRepo.listTasks(1, 1000)
    let cleaned = 0
    for (const task of tasks.items) {
      if (task.status === 'running' || task.status === 'paused') {
        this.store.taskRepo.updateTask(task.id, { status: 'stopped' })
        cleaned++
        continue
      }
      if (task.status === 'idle' && task.scriptFolder) {
        const resolvedPath = existsSync(task.scriptFolder)
          ? task.scriptFolder
          : join(this.scriptsDir, task.scriptFolder)
        if (!existsSync(resolvedPath)) {
          this.store.taskRepo.updateTask(task.id, { status: 'error' })
          cleaned++
          continue
        }
        const isDir = existsSync(resolvedPath) && statSync(resolvedPath).isDirectory()
        if (isDir) {
          const metaPath = join(resolvedPath, 'meta.json')
          let entryFile = join(resolvedPath, 'index.js')
          if (existsSync(metaPath)) {
            try {
              const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
              if (meta.entryPoint) entryFile = join(resolvedPath, meta.entryPoint)
            } catch {
              /* ignore */
            }
          }
          if (!existsSync(entryFile)) {
            this.store.taskRepo.updateTask(task.id, { status: 'error' })
            cleaned++
          }
        } else if (!existsSync(resolvedPath)) {
          this.store.taskRepo.updateTask(task.id, { status: 'error' })
          cleaned++
        }
      }
    }
    this.runningTasks.clear()
    if (cleaned > 0) {
      createLogger('task').info(`Cleaned ${cleaned} orphan/broken tasks`)
    }
  }

  cleanup(): void {
    for (const [id, running] of this.runningTasks) {
      try {
        if (running.process?.pid) {
          running.process.kill('SIGTERM')
        }
        running.logBuffer.destroy()
      } catch (err) {
        createLogger('task').warn('Failed to kill running process on shutdown', {
          taskId: id,
          error: String(err)
        })
      }
    }
    this.runningTasks.clear()
    this.completedOutputs.clear()
    this.dataSnapshots.clear()
  }

  private trimCompletedOutputs(): void {
    if (this.completedOutputs.size <= MAX_COMPLETED_OUTPUTS) return
    const entries = [...this.completedOutputs.entries()]
    const toDelete = entries.slice(0, entries.length - MAX_COMPLETED_OUTPUTS)
    for (const [key] of toDelete) {
      this.completedOutputs.delete(key)
    }
  }

  private sendToRenderer(channel: string, data: unknown): void {
    this.rendererSender?.(channel, data)
  }
}

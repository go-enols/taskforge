import { spawn, ChildProcess, exec } from 'child_process'
import { promisify } from 'util'
const execAsync = promisify(exec)
import { join, resolve as resolvePath } from 'path'
import { existsSync, readFileSync, statSync } from 'fs'
import { app } from 'electron'
import { createLogger } from '../utils/logger'
import { LogBuffer } from '../utils/log-buffer'
import type { LogEntry } from '../utils/log-buffer'
import { SdkLineParser } from './sdk-protocol'
import type { StoreService } from './store'
import type { TaskOutput, TaskLogBatch, PermissionSet } from '../../shared/types'

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
        running.logBuffer.push('warn', 'node_modules 不完整（部分依赖缺失），将重新安装…')
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
        const envKey = `TASK_${key.toUpperCase()}`
        if (SYSTEM_PROTECTED_KEYS.has(envKey)) continue
        env[envKey] = String(value)
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
          const wallets = this.store.walletRepo.listWallets(1, 99999)
          const walletData = wallets.items.map((w) => ({
            id: w.id,
            address: w.address,
            walletType: w.walletType,
            privateKey: w.privateKey,
            mnemonic: w.mnemonic,
            labels: w.labels
          }))
          env['TASK_WALLETS'] = JSON.stringify(walletData)
        } catch (err) {
          createLogger('task').warn('Failed to inject wallet data', { error: String(err) })
        }
      } else {
        env['TASK_WALLETS'] = '[]'
      }

      // ⑤ 注入账户数据（仅在有网络权限且非沙箱时注入）
      // 如果 config 没有显式注入账户，尝试从 manifest 的 requiredAccountTemplateIds 匹配
      if (!task.isSandbox && effectivePermissions.network) {
        try {
          const allAccounts = this.store.listAccounts(1, 99999)
          const relevantTemplateIds = new Set<string>()
          // 检查 config 中是否有 template 引用
          if (task.config._accounts && Array.isArray(task.config._accounts)) {
            for (const acc of task.config._accounts as Array<{ templateId?: string }>) {
              if (acc.templateId) relevantTemplateIds.add(acc.templateId)
            }
          }
          if (relevantTemplateIds.size > 0) {
            const matched = allAccounts.items.filter((a) => relevantTemplateIds.has(a.templateId))
            if (matched.length > 0) {
              env['TASK_ACCOUNTS'] = JSON.stringify(matched.map((a) => ({
                id: a.id, templateId: a.templateId, pool: a.pool, labels: a.labels, data: a.data
              })))
            }
          }
        } catch (err) {
          createLogger('task').warn('Failed to inject account data', { error: String(err) })
        }
      } else {
        env['TASK_ACCOUNTS'] = '[]'
      }

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
      const isTsx = command === 'npx' && args[0] === 'tsx'
      if (!isTsx) {
        const enforcerPath = resolvePath(__dirname, 'sandbox-enforcer.cjs')
        // Sanity check: enforcer file must exist
        if (existsSync(enforcerPath)) {
          const existingOpts = env.NODE_OPTIONS || ''
          env.NODE_OPTIONS = `--require ${enforcerPath}${existingOpts ? ' ' + existingOpts : ''}`
        } else {
          createLogger('task').warn('Sandbox enforcer not found at ' + enforcerPath)
        }
      }

      const proc = spawn(command, args, {
        cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe']
      })

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
          } else {
            logBuffer.push('error', `[sdk] result error: ${error ?? 'unknown'}`)
          }
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
          durationMs: Date.now() - running.startedAt
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
      durationMs: Date.now() - running.startedAt
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

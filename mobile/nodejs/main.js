/**
 * TaskForge Mobile Node.js 运行时入口
 *
 * 由 @capawesome/capacitor-nodejs 在 Android 后台线程启动：
 *   node main.js
 *
 * 职责：
 * - 接收 Capacitor 端 RPC（install / run / stop / remove / list / ping）
 * - 把脚本文件解包写入应用私有目录（app.datadir()/tasks/<id>）
 * - 在 Worker 线程中执行用户脚本（带 sandbox-enforcer 权限 patch），转发日志/进度/结果
 * - Worker 不可用时降级为当前运行时执行（并在日志中提示无法强制停止）
 *
 * 注意：nodejs-mobile 不支持 child_process，且 Node 运行时每个 App 进程只能启动一次。
 */
'use strict'

const { app, channel } = require('bridge')
const fs = require('fs')
const path = require('path')

let WorkerCtor = null
try {
  WorkerCtor = require('worker_threads').Worker
} catch {
  WorkerCtor = null
}

const DATA_ROOT = app.datadir()
const TASKS_ROOT = path.join(DATA_ROOT, 'tasks')
const ENFORCER_PATH = path.join(__dirname, 'sandbox-enforcer.cjs')
const WORKER_PATH = path.join(__dirname, 'task-worker.js')
const MAX_FILES = 4000
const MAX_TOTAL_BYTES = 50 * 1024 * 1024
const LOG_RING_SIZE = 500

fs.mkdirSync(TASKS_ROOT, { recursive: true })

/** taskId -> { worker, startedAt, status, logs, timer } */
const running = new Map()

/** 安全的任务 ID（也是目录名） */
function assertTaskId(taskId) {
  if (typeof taskId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(taskId)) {
    throw new Error('非法的任务 ID')
  }
  return taskId
}

/** 任务目录 */
function taskDir(taskId) {
  return path.join(TASKS_ROOT, assertTaskId(taskId))
}

/** 安全相对路径：拒绝绝对路径 / 越界 / 反斜杠 */
function safeRelPath(relPath) {
  if (typeof relPath !== 'string' || relPath.length === 0) throw new Error('文件路径为空')
  const normalized = relPath.replace(/\\/g, '/')
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) throw new Error('不允许绝对路径')
  const parts = normalized.split('/')
  if (parts.some((part) => part === '..' || part === '' || part === '.')) {
    throw new Error(`非法文件路径: ${relPath}`)
  }
  return parts.join('/')
}

function sendLog(taskId, level, message) {
  const entry = { taskId, level, message, timestamp: new Date().toISOString() }
  const state = running.get(taskId)
  if (state) {
    state.logs.push(entry)
    if (state.logs.length > LOG_RING_SIZE) state.logs.shift()
  }
  channel.post('task-log', entry)
}

function sendStatus(taskId, status, extra) {
  const state = running.get(taskId)
  if (state) state.status = status
  channel.post('task-status', { taskId, status, ...(extra || {}) })
}

function reply(id, ok, data, error) {
  channel.post('rpc-result', { id, ok, data: data === undefined ? null : data, error: error || null })
}

/** 解析脚本 stdout 的 SDK NDJSON 协议（与桌面端一致） */
function handleScriptLine(taskId, line) {
  const text = line.trimEnd()
  if (!text) return
  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const msg = JSON.parse(text)
      if (msg && typeof msg === 'object' && typeof msg.type === 'string') {
        if (msg.type === 'log') {
          sendLog(taskId, ['debug', 'info', 'warn', 'error'].includes(msg.level) ? msg.level : 'info', String(msg.message ?? ''))
          return
        }
        if (msg.type === 'error') {
          sendLog(taskId, 'error', String(msg.message ?? '脚本错误'))
          return
        }
        if (msg.type === 'progress') {
          const percent = Math.max(0, Math.min(100, Number(msg.percent) || 0))
          channel.post('task-progress', { taskId, percent, message: msg.message ? String(msg.message) : '' })
          return
        }
        if (msg.type === 'result') {
          channel.post('task-result', { taskId, ok: !!msg.ok, data: msg.data ?? null, error: msg.error ?? null })
          return
        }
        if (msg.type === 'data') {
          channel.post('task-data', {
            taskId,
            key: String(msg.key ?? 'data'),
            label: msg.label ? String(msg.label) : '',
            view: msg.view ? String(msg.view) : 'auto',
            data: msg.data ?? null
          })
          return
        }
      }
    } catch {
      /* 非 SDK 行，按普通日志处理 */
    }
  }
  sendLog(taskId, 'info', text)
}

function attachLineReader(stream, taskId, level) {
  if (!stream) return
  let buffer = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    buffer += chunk
    let index = buffer.indexOf('\n')
    while (index >= 0) {
      const line = buffer.slice(0, index)
      buffer = buffer.slice(index + 1)
      if (line.trim()) handleScriptLine(taskId, line)
      index = buffer.indexOf('\n')
    }
  })
  stream.on('end', () => {
    if (buffer.trim()) handleScriptLine(taskId, buffer)
  })
}

function buildTaskEnv(taskId, manifest, config, sandbox) {
  const taskPath = taskDir(taskId)
  const permissions = manifest && manifest.permissions && Array.isArray(manifest.permissions) ? manifest.permissions : []
  const allowNetwork = !sandbox && permissions.includes('network')
  const allowFilesystem = !sandbox && permissions.includes('filesystem')
  return {
    TASK_ID: taskId,
    TASK_CONFIG: JSON.stringify(config || {}),
    TASK_PERM_NETWORK: allowNetwork ? '1' : '0',
    TASK_PERM_FILESYSTEM: allowFilesystem ? '1' : '0',
    TASK_SANDBOX: sandbox ? '1' : '0',
    TASK_CWD_RESOLVED: taskPath,
    TASK_DATA_ROOT: DATA_ROOT,
    TASK_MOBILE: '1'
  }
}

function readManifest(taskId) {
  const metaPath = path.join(taskDir(taskId), 'meta.json')
  if (!fs.existsSync(metaPath)) throw new Error('任务未安装')
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
  return meta && meta.manifest ? meta.manifest : meta
}

/** 启动 Worker 执行脚本；返回是否有 Worker 支持 */
function runInWorker(taskId, entry, env, config) {
  const worker = new WorkerCtor(WORKER_PATH, {
    workerData: { taskId, entry, config },
    env: { ...process.env, ...env },
    execArgv: fs.existsSync(ENFORCER_PATH) ? ['--require', ENFORCER_PATH] : [],
    stdout: true,
    stderr: true
  })
  running.set(taskId, { worker, startedAt: Date.now(), status: 'running', logs: [] })

  attachLineReader(worker.stdout, taskId, 'info')
  attachLineReader(worker.stderr, taskId, 'error')

  worker.on('message', (message) => {
    if (!message || typeof message !== 'object') return
    if (message.type === 'log') sendLog(taskId, message.level || 'info', String(message.message ?? ''))
    else if (message.type === 'error') sendLog(taskId, 'error', String(message.message ?? '脚本异常'))
    else if (message.type === 'status') {
      if (message.status === 'started') sendStatus(taskId, 'running')
      else if (message.status === 'exit') sendStatus(taskId, 'exited', { exitCode: message.code ?? 0 })
    }
  })
  worker.on('error', (err) => {
    sendLog(taskId, 'error', `脚本运行异常: ${err && err.stack ? err.stack : String(err)}`)
  })
  worker.on('exit', (code) => {
    const state = running.get(taskId)
    if (state && state.worker === worker) {
      running.delete(taskId)
      sendStatus(taskId, 'exited', { exitCode: code, durationMs: Date.now() - state.startedAt })
    }
  })

  sendStatus(taskId, 'running')
  sendLog(taskId, 'info', `任务已启动（Worker 隔离模式，入口 ${path.basename(entry)}）`)
  return true
}

/** 无 Worker 支持时在当前运行时内执行（无法强制停止） */
function runInline(taskId, entry, env, config) {
  Object.assign(process.env, env)
  const state = { worker: null, startedAt: Date.now(), status: 'running', logs: [] }
  running.set(taskId, state)

  const originalWrite = process.stdout.write.bind(process.stdout)
  const originalError = process.stderr.write.bind(process.stderr)
  let buffer = ''
  const onWrite = (chunk) => {
    const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
    buffer += text
    let index = buffer.indexOf('\n')
    while (index >= 0) {
      const line = buffer.slice(0, index)
      buffer = buffer.slice(index + 1)
      if (line.trim()) handleScriptLine(taskId, line)
      index = buffer.indexOf('\n')
    }
    return originalWrite(chunk)
  }
  process.stdout.write = onWrite
  process.stderr.write = onWrite

  sendStatus(taskId, 'running')
  sendLog(taskId, 'warn', '当前运行时不支持 Worker 隔离，脚本在主运行时执行（无法强制停止）')

  try {
    const taskPath = taskDir(taskId)
    delete require.cache[require.resolve(entry)]
    const mod = require(entry)
    if (mod && typeof mod.then === 'function') {
      mod.catch((err) => sendLog(taskId, 'error', String(err)))
    }
    // 脚本通常注册异步任务后立即返回，保持 running；真正结束时无法可靠感知
    sendLog(taskId, 'info', '脚本入口已加载（异步任务继续运行）')
  } catch (err) {
    sendLog(taskId, 'error', err && err.stack ? err.stack : String(err))
    running.delete(taskId)
    sendStatus(taskId, 'error')
  } finally {
    state.stdoutRestore = () => {
      process.stdout.write = originalWrite
      process.stderr.write = originalError
    }
    if (!running.has(taskId)) state.stdoutRestore()
  }
  return false
}

/* ───────────────────────────── RPC ───────────────────────────── */

channel.on('rpc', async (request) => {
  const id = request && request.id
  try {
    const cmd = request && request.cmd
    if (cmd === 'ping') {
      reply(id, true, {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        dataDir: DATA_ROOT,
        workerSupported: !!WorkerCtor,
        enforcerPresent: fs.existsSync(ENFORCER_PATH)
      })
      return
    }

    if (cmd === 'list') {
      const items = []
      for (const name of fs.readdirSync(TASKS_ROOT)) {
        try {
          const metaPath = path.join(TASKS_ROOT, name, 'meta.json')
          if (!fs.existsSync(metaPath)) continue
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
          items.push({ ...meta, running: running.has(name), status: (running.get(name) || {}).status || 'idle' })
        } catch {
          /* 忽略损坏目录 */
        }
      }
      reply(id, true, { items })
      return
    }

    if (cmd === 'install') {
      const taskId = assertTaskId(request.taskId)
      const files = Array.isArray(request.files) ? request.files : []
      if (files.length === 0) throw new Error('脚本包为空')
      if (files.length > MAX_FILES) throw new Error('脚本文件数量超过限制')
      const target = taskDir(taskId)
      let totalBytes = 0
      const prepared = []
      for (const file of files) {
        const relPath = safeRelPath(file.path)
        const data = Buffer.from(String(file.data || ''), 'base64')
        totalBytes += data.length
        if (totalBytes > MAX_TOTAL_BYTES) throw new Error('脚本包解压后体积超过限制（50MB）')
        prepared.push({ relPath, data })
      }
      if (running.has(taskId)) throw new Error('任务正在运行，无法覆盖安装')
      fs.rmSync(target, { recursive: true, force: true })
      fs.mkdirSync(target, { recursive: true })
      for (const file of prepared) {
        const dest = path.join(target, file.relPath)
        if (!dest.startsWith(target + path.sep)) throw new Error('非法文件路径')
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.writeFileSync(dest, file.data)
      }
      const meta = {
        id: taskId,
        name: String(request.name || taskId),
        version: String(request.version || ''),
        entryPoint: String(request.entryPoint || 'index.js'),
        manifest: request.manifest && typeof request.manifest === 'object' ? request.manifest : {},
        marketplaceId: request.marketplaceId ? String(request.marketplaceId) : null,
        installedAt: new Date().toISOString()
      }
      fs.writeFileSync(path.join(target, 'meta.json'), JSON.stringify(meta, null, 2))
      reply(id, true, { taskId, files: prepared.length, bytes: totalBytes })
      return
    }

    if (cmd === 'remove') {
      const taskId = assertTaskId(request.taskId)
      const state = running.get(taskId)
      if (state && state.worker) {
        await state.worker.terminate()
      }
      if (state && state.stdoutRestore) state.stdoutRestore()
      running.delete(taskId)
      fs.rmSync(taskDir(taskId), { recursive: true, force: true })
      reply(id, true, { removed: true })
      return
    }

    if (cmd === 'run') {
      const taskId = assertTaskId(request.taskId)
      if (running.has(taskId)) throw new Error('任务已在运行')
      const manifest = readManifest(taskId)
      const taskPath = taskDir(taskId)
      const entryRel = String(manifest.entryPoint || 'index.js')
      const entry = path.resolve(taskPath, entryRel)
      if (!entry.startsWith(taskPath + path.sep) && entry !== taskPath) throw new Error('入口文件越界')
      if (!fs.existsSync(entry)) throw new Error(`入口文件不存在: ${entryRel}`)
      if (!/\.(js|cjs|mjs)$/i.test(entry)) throw new Error('只允许执行 .js/.cjs/.mjs 脚本')
      const env = buildTaskEnv(taskId, manifest, request.config || {}, !!request.sandbox)
      const usedWorker = WorkerCtor ? runInWorker(taskId, entry, env, request.config || {}) : runInline(taskId, entry, env, request.config || {})
      reply(id, true, { taskId, worker: usedWorker })
      return
    }

    if (cmd === 'stop') {
      const taskId = assertTaskId(request.taskId)
      const state = running.get(taskId)
      if (!state) {
        reply(id, true, { stopped: false, reason: 'not-running' })
        return
      }
      if (state.worker) {
        await state.worker.terminate()
        running.delete(taskId)
        sendStatus(taskId, 'stopped', { durationMs: Date.now() - state.startedAt })
        sendLog(taskId, 'warn', '任务已手动停止')
        reply(id, true, { stopped: true })
      } else {
        if (state.stdoutRestore) state.stdoutRestore()
        running.delete(taskId)
        sendStatus(taskId, 'stopped')
        sendLog(taskId, 'warn', '当前运行时无法强制终止脚本，已结束任务状态；如脚本仍在执行请重启 App')
        reply(id, true, { stopped: true, forced: false })
      }
      return
    }

    if (cmd === 'getLogs') {
      const taskId = assertTaskId(request.taskId)
      const state = running.get(taskId)
      reply(id, true, { logs: state ? state.logs.slice(-LOG_RING_SIZE) : [] })
      return
    }

    throw new Error(`未知命令: ${String(cmd)}`)
  } catch (err) {
    reply(id, false, null, err && err.message ? err.message : String(err))
  }
})

// 标记就绪（bridge 已加载；此日志用于调试）
sendLog('__runtime__', 'info', `TaskForge Node 运行时已就绪（${process.version}，worker=${!!WorkerCtor}）`)

/**
 * TaskForge 移动端任务执行 Worker
 * 在独立线程中加载用户脚本，并通过 parentPort 上报日志/状态。
 * 由 main.js 创建，参数：workerData = { taskId, entry, config }
 */
'use strict'

const { parentPort, workerData } = require('worker_threads')

function send(message) {
  try {
    parentPort.postMessage(message)
  } catch {
    /* ignore */
  }
}

process.on('uncaughtException', (err) => {
  send({ type: 'error', message: err && err.stack ? err.stack : String(err) })
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  send({ type: 'error', message: `Unhandled rejection: ${String(reason)}` })
})
process.on('beforeExit', (code) => {
  send({ type: 'status', status: 'exit', code })
})

try {
  send({ type: 'status', status: 'started' })
  const mod = require(workerData.entry)
  if (mod && typeof mod.then === 'function') {
    mod.catch((err) => send({ type: 'error', message: String(err) }))
  }
} catch (err) {
  send({ type: 'error', message: err && err.stack ? err.stack : String(err) })
  process.exit(1)
}

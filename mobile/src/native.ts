/**
 * @file Capacitor 原生能力桥接（Node.js 运行时）
 * @description 仅 Android App 可用；Web/PWA 构建下相关 UI 会隐藏。
 * @module mobile/src/native
 */
import { Capacitor, registerPlugin } from '@capacitor/core'
import type { NodejsPlugin } from '@capawesome/capacitor-nodejs'

/** 当前是否运行在原生 App（Capacitor）中 */
export const isNativeApp = Capacitor.isNativePlatform()

const Nodejs = registerPlugin<NodejsPlugin>('Nodejs')

interface PendingRpc {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: number
}

const pending = new Map<string, PendingRpc>()
let rpcSeq = 0
let listenersReady = false
let nodeEventHandler: ((eventName: string, payload: unknown) => void) | null = null

/** 订阅 Node 运行时推送的事件（task-log / task-status / ...） */
export function onNodeEvent(handler: (eventName: string, payload: unknown) => void): () => void {
  nodeEventHandler = handler
  return () => {
    if (nodeEventHandler === handler) nodeEventHandler = null
  }
}

function settlePending(id: string, ok: boolean, data: unknown, error: string | null): void {
  const entry = pending.get(id)
  if (!entry) return
  pending.delete(id)
  window.clearTimeout(entry.timer)
  if (ok) entry.resolve(data)
  else entry.reject(new Error(error || 'Node 执行失败'))
}

async function ensureListeners(): Promise<void> {
  if (listenersReady) return
  listenersReady = true
  await Nodejs.addListener('message', (event) => {
    const payload = (event.args && event.args[0]) as Record<string, unknown> | undefined
    if (event.eventName === 'rpc-result' && payload && typeof payload.id === 'string') {
      settlePending(
        payload.id,
        payload.ok === true,
        payload.data ?? null,
        typeof payload.error === 'string' ? payload.error : null
      )
      return
    }
    nodeEventHandler?.(event.eventName, payload ?? null)
  })
}

let readyPromise: Promise<void> | null = null

/** 等待 Node 运行时就绪（自动启动模式下随 App 启动） */
export function ensureNodeRuntime(): Promise<void> {
  if (!isNativeApp) return Promise.reject(new Error('Node.js 运行时仅在 Android App 中可用'))
  if (!readyPromise) {
    readyPromise = (async () => {
      await ensureListeners()
      for (let index = 0; index < 100; index++) {
        try {
          const { ready } = await Nodejs.isReady()
          if (ready) return
        } catch {
          /* 运行时尚未创建，继续等待 */
        }
        await new Promise((resolve) => window.setTimeout(resolve, 200))
      }
      throw new Error('Node.js 运行时启动超时')
    })()
  }
  return readyPromise
}

/** Node 运行时信息（App 内执行脚本的环境） */
export interface RuntimePing {
  node: string
  platform: string
  arch: string
  dataDir: string
  workerSupported: boolean
  enforcerPresent: boolean
}

/** 查询 Node 运行时信息（用于任务页展示运行环境） */
export function pingNodeRuntime(): Promise<RuntimePing> {
  return nodeRpc<RuntimePing>({ cmd: 'ping' }, 20000)
}

/** 向 Node 运行时发送 RPC 请求并等待结果 */
export async function nodeRpc<T = unknown>(
  command: Record<string, unknown>,
  timeoutMs = 30000
): Promise<T> {
  await ensureNodeRuntime()
  const id = `${Date.now()}-${++rpcSeq}`
  return await new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pending.delete(id)
      reject(new Error('Node 运行时响应超时'))
    }, timeoutMs)
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer })
    void Nodejs.send({
      eventName: 'rpc',
      args: [{ id, ...command }]
    }).catch((err: unknown) => {
      settlePending(id, false, null, err instanceof Error ? err.message : String(err))
    })
  })
}

/**
 * @file SDK 协议 — 任务脚本与主进程之间的 stdin/stdout JSON-RPC 通信
 * @description 定义脚本可以输出/接收的 JSON-RPC 消息格式, 解析器, 以及
 *              兼容老的纯文本 stdout (即未启用 SDK 的脚本)。
 *
 * 协议格式: 每一行一个 JSON 对象 (NDJSON / LSP-style), 通过换行符 `\n` 分隔。
 *
 * 脚本 → 主进程 (stdout):
 *   {"type":"log","level":"info","message":"...","fields":{...}}
 *   {"type":"progress","percent":50,"message":"..."}
 *   {"type":"error","message":"...","fields":{...}}
 *   {"type":"result","ok":true,"data":{...}}
 *   {"type":"response","id":1,"result":{...}}
 *
 * 主进程 → 脚本 (stdin):
 *   {"id":1,"method":"get_accounts","params":{...}}
 *   {"id":2,"method":"get_wallets"}
 *   {"type":"shutdown"}
 *
 * 解析行为: 解析器按行处理, 每行尝试 JSON.parse。
 * - 成功 + 含 type 字段: 派发到对应 handler
 * - 成功 + 含 id 字段: 视作 RPC 响应, 入队等待调用方获取
 * - 失败 / 不是 JSON: 当作普通 stdout 文本, 走 logBuffer.push('info', line)
 *   (向后兼容老脚本)
 *
 * 严格 JSON-RPC 2.0 不是目标 — 采用极简协议让脚本写起来零依赖。
 *
 * @module main/services/sdk-protocol
 */

import type { LogBuffer } from '../utils/log-buffer'

/** 脚本 → 主进程: 主动发起的消息 (无 id, type 必填) */
export type SdkMessage =
  | { type: 'log'; level: 'debug' | 'info' | 'warn' | 'error'; message: string; fields?: Record<string, unknown> }
  | { type: 'progress'; percent: number; message?: string }
  | { type: 'error'; message: string; fields?: Record<string, unknown> }
  | { type: 'result'; ok: boolean; data?: unknown; error?: string }
  | { type: 'response'; id: number; result?: unknown; error?: string }

/** 主进程 → 脚本: 主动发起的消息 (type + 必填字段) */
export type HostMessage =
  | { id: number; method: string; params?: unknown }
  | { type: 'shutdown' }

/** RPC 调用方拿到的响应结果 (result 或 error 二选一) */
export interface RpcResponse {
  result?: unknown
  error?: string
}

/** 等待中的 RPC 响应解析器: 用 Map<id, resolve/reject> */
type PendingRpc = {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
}

/**
 * SdkLineParser — 逐行解析脚本 stdout 输出
 *
 * 用法:
 *   const parser = new SdkLineParser({ logBuffer, onProgress, onResult, onResponse })
 *   proc.stdout.on('data', (chunk) => parser.feed(chunk.toString()))
 *   proc.on('exit', () => parser.flush())
 */
export class SdkLineParser {
  private buffer = ''
  private readonly pending = new Map<number, PendingRpc>()

  constructor(
    private readonly handlers: {
      logBuffer: LogBuffer
      onProgress?: (percent: number, message?: string) => void
      onResult?: (ok: boolean, data?: unknown, error?: string) => void
    }
  ) {}

  /**
   * 投递 stdout 的一块数据 (任意长度, 内部按 \n 切分)
   * 跨块的行会被缓存, 下次 feed 时继续拼接
   */
  feed(chunk: string): void {
    this.buffer += chunk
    const lines = this.buffer.split('\n')
    // 最后一段如果不是以 \n 结尾, 是不完整的下一行, 保留到 buffer
    this.buffer = lines.pop() ?? ''
    for (const line of lines) {
      this.processLine(line)
    }
  }

  /** 处理末尾可能残留的不完整行 (进程退出时调用) */
  flush(): void {
    if (this.buffer.trim()) {
      this.processLine(this.buffer)
      this.buffer = ''
    }
  }

  /**
   * 等待脚本对指定 id 的 RPC 响应 (主进程调用 → 脚本响应)
   * 实际场景: 进程内极少双向 RPC, 多用于 SDK 调用方主动 query
   */
  waitForResponse(id: number, timeoutMs = 30_000): Promise<RpcResponse> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`RPC timeout for id ${id}`))
      }, timeoutMs)
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve({ result: value })
        },
        reject: (err) => {
          clearTimeout(timer)
          resolve({ error: err.message })
        }
      })
    })
  }

  private processLine(line: string): void {
    const trimmed = line.trim()
    if (!trimmed) return

    // 尝试解析 JSON
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      // 非 JSON 行: 当作普通 stdout 文本 (向后兼容老脚本)
      this.handlers.logBuffer.push('info', trimmed)
      return
    }

    if (typeof parsed !== 'object' || parsed === null) {
      this.handlers.logBuffer.push('info', trimmed)
      return
    }

    const msg = parsed as Record<string, unknown>

    // 1. RPC 响应 (id 字段): 派发到等待方
    if (typeof msg.id === 'number' && !msg.type) {
      const waiter = this.pending.get(msg.id)
      if (waiter) {
        this.pending.delete(msg.id)
        if ('error' in msg && msg.error) {
          waiter.reject(new Error(String(msg.error)))
        } else {
          waiter.resolve(msg.result)
        }
      }
      return
    }

    // 2. 主动消息 (type 字段)
    if (typeof msg.type !== 'string') {
      // 既是 JSON 又没 type 也没 id: 视作 raw log
      this.handlers.logBuffer.push('info', trimmed)
      return
    }

    switch (msg.type) {
      case 'log': {
        const level = (msg.level as 'debug' | 'info' | 'warn' | 'error') || 'info'
        this.handlers.logBuffer.push(level, String(msg.message ?? ''))
        break
      }
      case 'progress': {
        const percent = Math.max(0, Math.min(100, Number(msg.percent) || 0))
        this.handlers.onProgress?.(percent, msg.message as string | undefined)
        break
      }
      case 'error': {
        this.handlers.logBuffer.push('error', String(msg.message ?? ''))
        break
      }
      case 'result': {
        this.handlers.onResult?.(Boolean(msg.ok), msg.data, msg.error as string | undefined)
        break
      }
      // 脚本发的 response 也会走上面 id 分支, 这里不再处理
      default:
        // 未知 type: 当作 raw log (便于将来扩展)
        this.handlers.logBuffer.push('info', trimmed)
    }
  }
}

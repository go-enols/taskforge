/**
 * @file IPC 共享注册表
 * @description 包含 handlerMap、注册函数、类型定义等，供 index.ts 和各 handler 文件共享使用。
 *              避免 index.ts 与 handler 文件之间的循环依赖。
 */
import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron'
import { StoreService } from '../services/store'
import { TaskService } from '../services/task'
import { ScriptFetcher } from '../services/script-fetcher'
import { WalletRepository } from '../services/repositories/wallet'
import { ProxyRepository } from '../services/repositories/proxy'
import { TaskRepository } from '../services/repositories/task'
import { createLogger } from '../utils/logger'

const logger = createLogger('ipc')

/** 所有需要注入到 IPC 处理器的服务与仓库实例集合 */
export interface Services {
  /** 数据库存储服务 */
  store: StoreService
  /** 任务执行引擎（子进程管理） */
  taskService: TaskService
  /** 远程脚本下载器 */
  scriptFetcher: ScriptFetcher
  /** 钱包数据仓库 */
  walletRepo: WalletRepository
  /** 代理数据仓库 */
  proxyRepo: ProxyRepository
  /** 任务数据仓库 */
  taskRepo: TaskRepository
}

/** API 错误信息结构 */
export interface ApiError {
  /** 错误描述 */
  message: string
  /** 错误编码（如 NOT_FOUND / VALIDATION_ERROR） */
  code?: string
  /** 错误分类（如 GENERAL / BUSINESS / SYSTEM） */
  category?: string
}

/**
 * API 调用结果包装
 * 无论 IPC 还是 HTTP 传输层，统一返回此结构。
 * 正常时 data 存在，异常时 error 存在。
 */
export interface ApiResult<T = unknown> {
  /** 成功响应数据 */
  data?: T
  /** 错误信息（存在时表示调用失败） */
  error?: ApiError
}

/** API 处理器函数签名：接收任意参数数组，返回任意值或 Promise */
export type ApiHandler = (...args: unknown[]) => unknown | Promise<unknown>

/**
 * 全局处理器映射表
 * 存储所有已注册的 channel → handler 映射，供 IPC 和 HTTP 共享调用。
 * HTTP API 服务器通过 executeHandler() 使用此映射表。
 */
export const handlerMap = new Map<string, ApiHandler>()

/**
 * 统一错误处理：将未知类型的异常转换为 ApiResult 错误结构
 * @param err - 捕获到的任意异常
 * @returns 包含错误信息的 ApiResult 对象
 */
export function handleError(err: unknown): ApiResult {
  const message = err instanceof Error ? err.message : String(err)
  logger.error('handler error', { message })
  return {
    error: {
      message,
      code:
        err instanceof Error && 'code' in err
          ? String((err as Error & { code: string }).code)
          : 'UNKNOWN',
      category:
        err instanceof Error && 'category' in err
          ? String((err as Error & { category: string }).category)
          : 'GENERAL'
    }
  }
}

/**
 * 执行指定 channel 的处理器
 *
 * 这是 IPC 和 HTTP 双传输层的统一执行入口。
 * 从 handlerMap 查找 channel 对应的 handler 并执行。
 *
 * @param channel - 要调用的 channel 名称（如 'wallet:list'）
 * @param args - 传递给 handler 的参数数组
 * @returns 调用结果，成功包含 data，失败包含 error
 */
export async function executeHandler(channel: string, args: unknown[]): Promise<ApiResult> {
  const handler = handlerMap.get(channel)
  if (!handler) {
    return { error: { message: `Unknown channel: ${channel}`, code: 'NOT_FOUND' } }
  }
  try {
    const result = await handler(...args)
    return { data: result }
  } catch (err) {
    return handleError(err)
  }
}

/**
 * 注册 IPC channel
 *
 * 同时注册到 handlerMap（供 HTTP API 共享）和 ipcMain.handle（IPC 通信），
 * 实现单一注册、双传输层可用。
 *
 * @param channel - channel 名称
 * @param handler - 对应的处理器函数
 */
export function register(channel: string, handler: ApiHandler): void {
  handlerMap.set(channel, handler)
  ipcMain.handle(
    channel,
    async (_event: IpcMainInvokeEvent, ...args: unknown[]): Promise<ApiResult> => {
      return executeHandler(channel, args)
    }
  )
}

/**
 * 恢复原生对话框关闭后的窗口状态
 *
 * Windows 平台原生 IFileDialog/IFileSaveDialog 关闭后，父 HWND 偶尔会停留在
 * WS_DISABLED 状态，导致后续所有鼠标点击在到达 renderer 之前被 OS 丢弃，
 * 表现为"页面看起来正常但所有按钮都点不动"。
 *
 * 此辅助函数强制清除该状态，恢复窗口可交互。失败安全（窗口已销毁时静默跳过）。
 *
 * @param win - 触发原生对话框的 BrowserWindow
 */
export function restoreWindowAfterDialog(win: BrowserWindow): void {
  try {
    if (win.isDestroyed()) return
    if (win.isMinimized()) win.restore()

    setImmediate(() => {
      try {
        if (win.isDestroyed()) return
        win.setEnabled(true)
        win.focus()
        win.webContents.focus()
      } catch (err) {
        logger.warn('Failed to restore window after native dialog (deferred):', {
          error: err instanceof Error ? err.message : String(err)
        })
      }
    })
  } catch (err) {
    logger.warn('Failed to schedule window restore after native dialog:', {
      error: err instanceof Error ? err.message : String(err)
    })
  }
}

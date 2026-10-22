/**
 * @file Preload 脚本 — Context Bridge 主入口
 * @description 通过 Electron contextBridge 将主进程的 IPC 通信能力暴露给渲染进程。
 *              所有 invoke/on 均受 shared/ipc-channels.ts 白名单约束，未知 channel 直接拒绝；
 *              依赖 contextIsolation（默认开启），preload 运行在 sandbox 中。
 * @module preload
 */
import { contextBridge, ipcRenderer } from 'electron'
import { isAllowedEventChannel, isAllowedInvokeChannel } from '../shared/ipc-channels'

/** HTTP API 端口/令牌（由主进程通过同步 IPC 注入；用于传输层降级） */
interface HttpInfo {
  port: number
  token: string
}

let httpInfo: HttpInfo = { port: 34116, token: '' }
try {
  const info = ipcRenderer.sendSync('app:getHttpInfo') as HttpInfo | undefined
  if (info && typeof info.port === 'number') httpInfo = info
} catch {
  // 主进程尚未注册该同步 handler（极少见）：保留默认值，传输层会走 IPC
}

/** 暴露给渲染进程的 API 对象 */
const api = {
  /**
   * 通过 IPC 调用主进程处理器（仅允许白名单 channel）
   * @param channel - IPC 频道名称（如 "wallet:list"）
   * @param args - 传递给处理器的参数列表
   * @returns 处理器返回的结果
   */
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> => {
    if (!isAllowedInvokeChannel(channel)) {
      return Promise.reject(new Error(`Blocked IPC channel: ${String(channel)}`))
    }
    return ipcRenderer.invoke(channel, ...args)
  },
  /**
   * 注册 IPC 事件监听器（仅允许白名单事件 channel）
   * @param channel - 事件频道名称
   * @param callback - 事件回调函数
   * @returns 取消监听的清理函数
   */
  on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
    if (!isAllowedEventChannel(channel)) {
      console.warn(`[preload] Blocked IPC event channel: ${String(channel)}`)
      return () => {}
    }
    const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void =>
      callback(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },
  /** HTTP API 端口号（由主进程注入，用于传输层降级） */
  httpPort: httpInfo.port,
  /** HTTP API 认证令牌（由主进程注入） */
  httpToken: httpInfo.token
}

contextBridge.exposeInMainWorld('electronAPI', api)

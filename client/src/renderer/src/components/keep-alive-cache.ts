/**
 * @file keep-alive-cache — 路由级 KeepAlive 缓存层
 * @description 使用模块级 Map 缓存路由的 ReactElement，确保导航后组件不卸载、状态不丢失。
 *              与 KeepAliveOutlet.tsx 分离，以便满足 react-refresh 的 single-export 约束。
 * @module renderer/components
 */
import type { ReactElement } from 'react'

/**
 * 模块级缓存 Map，以路由 pathname 为键，缓存对应的 ReactElement。
 *
 * 使用模块级 Map 而非 useRef 的原因：
 * - useRef 在 React 替换组件实例时会被重置，导致页面切换时前一页的状态丢失
 * - Map 的生命周期绑定到 JS 模块实例，在整个渲染进程会话期间持久存在
 *
 * 该文件与 KeepAliveOutlet.tsx 分离，使 KeepAliveOutlet.tsx 可保持单一默认导出，
 * 满足 react-refresh/only-export-components ESLint 规则（HMR 热更新要求）。
 */
const elementCache = new Map<string, ReactElement>()

/**
 * 清空所有缓存的路由组件
 *
 * 在用户登出或硬性会话重置时调用，防止前一会话的状态泄漏到新的会话中。
 */
export function clearKeepAliveCache(): void {
  elementCache.clear()
}

/** 获取缓存大小（仅供测试和调试使用） */
export function getKeepAliveCacheSize(): number {
  return elementCache.size
}

/** 内部方法：将路由元素写入缓存。仅 KeepAliveOutlet 调用 */
export function setKeepAliveElement(path: string, element: ReactElement): void {
  elementCache.set(path, element)
}

/** 内部方法：枚举所有缓存条目。仅 KeepAliveOutlet 调用 */
export function getKeepAliveEntries(): Array<[string, ReactElement]> {
  return Array.from(elementCache.entries())
}

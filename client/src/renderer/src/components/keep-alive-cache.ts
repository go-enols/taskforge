import type { ReactElement } from 'react'

/**
 * Module-level cache that persists across re-renders and component
 * remounts. Keyed by the route's pathname.
 *
 * Why a module-level Map instead of `useRef`?
 *   - `useRef` is reset every time React replaces this component
 *     instance, which would defeat the purpose of "keep alive": the
 *     previously rendered page would unmount and remount on the next
 *     navigation, losing all in-component state.
 *   - The Map's lifetime is tied to the JS module instance, which
 *     lives for the entire renderer session.
 *
 * This file is intentionally separated from KeepAliveOutlet.tsx so
 * that KeepAliveOutlet.tsx can keep a single default-exported
 * component, which is required by the `react-refresh/only-export-components`
 * ESLint rule for HMR fast refresh to work.
 */
const elementCache = new Map<string, ReactElement>()

/**
 * Drop every cached route element. Call this on logout or any hard
 * session reset so previous-session state doesn't leak into a new one.
 */
export function clearKeepAliveCache(): void {
  elementCache.clear()
}

/** Read-only access for tests and debugging. */
export function getKeepAliveCacheSize(): number {
  return elementCache.size
}

/** Internal: write an element into the cache. Only KeepAliveOutlet calls this. */
export function setKeepAliveElement(path: string, element: ReactElement): void {
  elementCache.set(path, element)
}

/** Internal: enumerate cached entries. Only KeepAliveOutlet calls this. */
export function getKeepAliveEntries(): Array<[string, ReactElement]> {
  return Array.from(elementCache.entries())
}

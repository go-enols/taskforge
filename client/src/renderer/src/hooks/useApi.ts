import { useCallback, useEffect, useRef, useState } from 'react'

interface UseApiResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  execute: (...args: unknown[]) => Promise<T | null>
  reset: () => void
}

/**
 * Generic data-fetching hook.
 *
 * The returned `execute` and `reset` are stable across renders. We capture
 * the latest `apiFn` in a ref so callers can pass an inline arrow function
 * (new identity every render) without causing the consumer's
 * `useEffect([execute])` to refire on every render. The previous
 * implementation memoized `execute` with `[apiFn]` in its deps, which made
 * `execute` a new function on every render and triggered an infinite
 * re-render loop in any page that used it inside a deps array (notably
 * Scheduler.tsx → "page keeps flickering").
 *
 * The `apiFnRef.current = apiFn` update lives in a useEffect (not directly
 * in the render body) to satisfy react-hooks/refs — refs must not be mutated
 * during render. Pattern mirrors useAsyncEffect.
 */
export function useApi<T>(apiFn: (...args: unknown[]) => Promise<T>): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const apiFnRef = useRef(apiFn)
  useEffect(() => {
    apiFnRef.current = apiFn
  })

  const execute = useCallback(async (...args: unknown[]): Promise<T | null> => {
    setLoading(true)
    setError(null)
    try {
      const result = await apiFnRef.current(...args)
      setData(result)
      return result
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setData(null)
    setLoading(false)
    setError(null)
  }, [])

  return { data, loading, error, execute, reset }
}

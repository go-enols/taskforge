import { describe, it, expect, vi } from 'vitest'
import React, { useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { useApi } from '../../../src/renderer/src/hooks/useApi'

/**
 * useApi must return a stable `execute` function reference across renders
 * when the caller passes a freshly-allocated `apiFn` (e.g. an inline arrow).
 * The previous implementation memoized `execute` with `[apiFn]` in its deps,
 * so `execute` was a new function every render. Callers that put `execute`
 * into a useEffect dep array (e.g. Scheduler.tsx) then re-fired the effect
 * every render, which set state, which re-rendered, which re-ran the
 * effect, etc. — a flicker loop.
 *
 * The fix mirrors the pattern used by useAsyncEffect and usePaginatedList:
 * capture `apiFn` in a ref that is updated on every render, and memoize
 * `execute` with an empty dep array so it is stable.
 */
describe('useApi — stable execute (flicker regression)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('returns the same execute reference across re-renders when apiFn is a new arrow each time', () => {
    const seen: unknown[] = []

    function Harness(): React.ReactElement {
      const [, force] = useState(0)
      // Inline arrow: brand-new function on every render
      const { execute } = useApi(async (n: number) => n + 1)
      seen.push(execute)
      useEffect(() => {
        // expose to test scope
        ;(Harness as unknown as { _execute: unknown })._execute = execute
      })
      return (
        <div>
          <button data-testid="force" onClick={() => force((x) => x + 1)}>
            rerender
          </button>
        </div>
      )
    }

    act(() => {
      root = createRoot(container)
      root.render(<Harness />)
    })

    const first = (Harness as unknown as { _execute: unknown })._execute
    act(() => {
      ;(container.querySelector('[data-testid="force"]') as HTMLElement).dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true })
      )
    })
    act(() => {
      ;(container.querySelector('[data-testid="force"]') as HTMLElement).dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true })
      )
    })
    const last = (Harness as unknown as { _execute: unknown })._execute

    expect(first).toBe(last)
    // Sanity: 3 entries in `seen` (initial + 2 forced re-renders)
    expect(seen.length).toBe(3)
  })

  it('always invokes the latest apiFn, even when apiFn identity changes between renders', async () => {
    const calls: Array<{ tag: string; value: number }> = []

    function Harness({ tag, value }: { tag: string; value: number }): React.ReactElement {
      // Inline arrow that closes over the current props
      const { execute } = useApi(async () => {
        calls.push({ tag, value })
        return value
      })
      useEffect(() => {
        // expose to test scope
        ;(Harness as unknown as { _execute: unknown })._execute = execute
      })
      return <div data-testid="harness">{tag}:{value}</div>
    }

    let latest: ((...args: unknown[]) => Promise<unknown>) | null = null
    act(() => {
      root = createRoot(container)
      root.render(<Harness tag="v1" value={1} />)
    })
    latest = (Harness as unknown as { _execute: (...a: unknown[]) => Promise<unknown> })._execute
    await act(async () => {
      await latest!()
    })
    expect(calls).toEqual([{ tag: 'v1', value: 1 }])

    // Re-render with new prop
    act(() => {
      root.render(<Harness tag="v2" value={2} />)
    })
    latest = (Harness as unknown as { _execute: (...a: unknown[]) => Promise<unknown> })._execute
    await act(async () => {
      await latest!()
    })
    expect(calls).toEqual([
      { tag: 'v1', value: 1 },
      { tag: 'v2', value: 2 }
    ])
  })

  it('clears error on a successful re-execute and returns the new data', async () => {
    let shouldFail = true
    let latest: ReturnType<typeof useApi<number>> | null = null
    function Harness(): React.ReactElement {
      const api = useApi<number>(async () => {
        if (shouldFail) throw new Error('boom')
        return 42
      })
      latest = api
      return <div data-testid="harness">loading={String(api.loading)} err={api.error ?? 'none'}</div>
    }
    act(() => {
      root = createRoot(container)
      root.render(<Harness />)
    })
    await act(async () => {
      const r = await latest!.execute()
      expect(r).toBeNull()
    })
    expect(latest!.error).toBe('boom')
    shouldFail = false
    await act(async () => {
      const r = await latest!.execute()
      expect(r).toBe(42)
    })
    expect(latest!.error).toBeNull()
    expect(latest!.data).toBe(42)
  })
})

/**
 * This test specifically guards against the Scheduler flicker. It mounts
 * the exact pattern that was broken: a useEffect that depends on
 * `execute`, with `execute` produced from an inline-arrow `useApi`. Before
 * the fix, this triggered an infinite re-render loop (effect → setState →
 * re-render → effect). After the fix, the effect runs exactly once per
 * identity change of `execute`, which is now zero.
 */
describe('useApi — Scheduler flicker regression test', () => {
  it('useEffect([execute]) does not refire when apiFn is a new arrow each render', () => {
    const fetchCount = vi.fn().mockResolvedValue([1, 2, 3])

    let effectFires = 0

    function Page(): React.ReactElement {
      const [, force] = useState(0)
      const { execute } = useApi<number[]>(async () => fetchCount())
      useEffect(() => {
        effectFires += 1
        void execute().then((items) => {
          if (items) {
            // simulate setting state
            fetchCount.mockResolvedValueOnce([...items, items.length + 1])
          }
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [execute])
      return (
        <div>
          <button data-testid="force" onClick={() => force((x) => x + 1)}>
            rerender
          </button>
        </div>
      )
    }

    const container2 = document.createElement('div')
    document.body.appendChild(container2)
    let root2: Root
    act(() => {
      root2 = createRoot(container2)
      root2.render(<Page />)
    })
    const initial = effectFires
    // Force 3 re-renders. With the old useApi, effectFires would equal 4+
    // (one per re-render because `execute` was a new function each time).
    act(() => {
      ;(container2.querySelector('[data-testid="force"]') as HTMLElement).dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true })
      )
    })
    act(() => {
      ;(container2.querySelector('[data-testid="force"]') as HTMLElement).dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true })
      )
    })
    act(() => {
      ;(container2.querySelector('[data-testid="force"]') as HTMLElement).dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true })
      )
    })
    act(() => root2.unmount())
    container2.remove()
    // Effect should have fired exactly once (initial mount), not per re-render.
    expect(effectFires - initial).toBe(0)
  })
})

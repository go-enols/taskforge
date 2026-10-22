/**
 * @file useApi Hook 测试
 * @description 验证 useApi Hook 的 execute 函数引用稳定性，
 *              防止因 apiFn 内联箭头函数导致的重渲染闪烁循环，
 *              以及错误清除、Scheduler 闪烁回归等场景。
 * @module tests/renderer/hooks
 */

import { describe, it, expect, vi } from 'vitest'
import React, { useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { useApi } from '../../../src/renderer/src/hooks/useApi'

/**
 * useApi 必须在每次渲染中返回稳定的 `execute` 函数引用，
 * 即使调用方传入的是每次新分配的 `apiFn`（如内联箭头函数）。
 *
 * 旧实现将 `execute` 以 `[apiFn]` 为依赖记忆化，导致每次渲染都创建新函数。
 * 将 `execute` 放入 useEffect 依赖数组的调用方（如 Scheduler.tsx）
 * 会因此触发无限重渲染循环（effect → setState → re-render → effect）。
 *
 * 修复方案：参照 useAsyncEffect 和 usePaginatedList 的模式，
 * 将 `apiFn` 存入 ref（每次渲染更新），`execute` 以空数组记忆化。
 */
// describe: useApi execute 稳定性测试（闪烁回归验证）
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
      const { execute } = useApi(async (...args: unknown[]) => Number(args[0] ?? 0) + 1)
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
 * 该测试专门防御 Scheduler 闪烁问题。
 * 它挂载了之前出问题的精确模式：useEffect 依赖 `execute`，
 * 而 `execute` 来自内联箭头函数的 useApi。
 * 修复前会触发无限重渲染循环（effect → setState → re-render → effect）。
 * 修复后 effect 仅在 `execute` 引用变化时运行一次（现在为 0 次）。
 */
// describe: useApi Scheduler 闪烁回归测试
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

import React, { useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import KeepAliveOutlet from '../../../src/renderer/src/components/KeepAliveOutlet'
import { clearKeepAliveCache } from '../../../src/renderer/src/components/keep-alive-cache'

/**
 * These tests use a module-level mount counter and useState to verify
 * that <KeepAliveOutlet /> actually keeps previously visited pages
 * mounted in the React tree. If a page gets remounted on a
 * navigate-away-and-back, its useState initializer re-runs and the
 * counter increments — that's the failure mode we're guarding against.
 */
let mountLog: string[] = []

function PageA(): React.ReactElement {
  const [counter, setCounter] = useState(0)
  useEffect(() => {
    mountLog.push('A:mount')
    return () => mountLog.push('A:unmount')
  }, [])
  return (
    <div data-testid="page-a">
      <span data-testid="page-a-counter">{counter}</span>
      <button data-testid="page-a-increment" onClick={() => setCounter((c) => c + 1)}>
        +1
      </button>
    </div>
  )
}

function PageB(): React.ReactElement {
  const [counter, setCounter] = useState(100)
  useEffect(() => {
    mountLog.push('B:mount')
    return () => mountLog.push('B:unmount')
  }, [])
  return (
    <div data-testid="page-b">
      <span data-testid="page-b-counter">{counter}</span>
      <button data-testid="page-b-increment" onClick={() => setCounter((c) => c + 1)}>
        +1
      </button>
    </div>
  )
}

function NavBar(): React.ReactElement {
  const navigate = useNavigate()
  return (
    <nav>
      <button data-testid="go-a" onClick={() => navigate('/a')}>
        A
      </button>
      <button data-testid="go-b" onClick={() => navigate('/b')}>
        B
      </button>
    </nav>
  )
}

function Harness({ initialPath }: { initialPath: string }): React.ReactElement {
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <NavBar />
      <Routes>
        <Route element={<KeepAliveOutlet />}>
          <Route path="/a" element={<PageA />} />
          <Route path="/b" element={<PageB />} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

function click(el: Element | null): void {
  if (!el) throw new Error('element not found')
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

describe('KeepAliveOutlet', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    mountLog = []
    clearKeepAliveCache()
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('mounts the initial route and shows it as active', () => {
    act(() => {
      root = createRoot(container)
      root.render(<Harness initialPath="/a" />)
    })
    const pageA = container.querySelector('[data-testid="page-a"]')
    const pageB = container.querySelector('[data-testid="page-b"]')

    expect(pageA).not.toBeNull()
    expect(pageB).toBeNull() // never visited, never rendered
    expect(mountLog).toEqual(['A:mount'])

    const wrapper = pageA!.closest('[data-keep-alive-path]') as HTMLElement
    expect(wrapper.getAttribute('data-active')).toBe('true')
    expect(wrapper.hasAttribute('hidden')).toBe(false)
  })

  it('keeps the previous page mounted in the DOM when navigating away', () => {
    act(() => {
      root = createRoot(container)
      root.render(<Harness initialPath="/a" />)
    })
    click(container.querySelector('[data-testid="go-b"]'))

    const pageA = container.querySelector('[data-testid="page-a"]')
    const pageB = container.querySelector('[data-testid="page-b"]')

    // Page A is still in the DOM (kept alive), Page B is now active
    expect(pageA).not.toBeNull()
    expect(pageB).not.toBeNull()
    expect(mountLog).toEqual(['A:mount', 'B:mount'])
    expect(mountLog).not.toContain('A:unmount') // <- the actual guarantee

    const wrapperA = pageA!.closest('[data-keep-alive-path]') as HTMLElement
    const wrapperB = pageB!.closest('[data-keep-alive-path]') as HTMLElement
    expect(wrapperA.getAttribute('data-active')).toBe('false')
    expect(wrapperA.hasAttribute('hidden')).toBe(true)
    expect(wrapperB.getAttribute('data-active')).toBe('true')
    expect(wrapperB.hasAttribute('hidden')).toBe(false)
  })

  it('preserves page state across navigation away and back', () => {
    act(() => {
      root = createRoot(container)
      root.render(<Harness initialPath="/a" />)
    })

    // Bump Page A's counter to 3
    click(container.querySelector('[data-testid="page-a-increment"]'))
    click(container.querySelector('[data-testid="page-a-increment"]'))
    click(container.querySelector('[data-testid="page-a-increment"]'))
    expect(container.querySelector('[data-testid="page-a-counter"]')?.textContent).toBe('3')

    // Navigate to B, then back to A
    click(container.querySelector('[data-testid="go-b"]'))
    click(container.querySelector('[data-testid="go-a"]'))

    // Page A's counter should still be 3 (not re-initialized to 0)
    expect(container.querySelector('[data-testid="page-a-counter"]')?.textContent).toBe('3')
    // Page A mounted exactly once across the whole session
    expect(mountLog.filter((l) => l === 'A:mount').length).toBe(1)
    expect(mountLog.filter((l) => l === 'A:unmount').length).toBe(0)
  })

  it('keeps all visited pages mounted simultaneously', () => {
    act(() => {
      root = createRoot(container)
      root.render(<Harness initialPath="/a" />)
    })
    click(container.querySelector('[data-testid="go-b"]'))
    click(container.querySelector('[data-testid="go-a"]'))
    click(container.querySelector('[data-testid="go-b"]'))

    const allWrappers = container.querySelectorAll('[data-keep-alive-path]')
    expect(allWrappers.length).toBe(2) // exactly /a and /b, no duplicates
    expect(mountLog.filter((l) => l === 'A:mount').length).toBe(1)
    expect(mountLog.filter((l) => l === 'B:mount').length).toBe(1)
  })

  it('clearKeepAliveCache drops all cached routes', () => {
    act(() => {
      root = createRoot(container)
      root.render(<Harness initialPath="/a" />)
    })
    click(container.querySelector('[data-testid="go-b"]'))
    expect(mountLog).toEqual(['A:mount', 'B:mount'])

    act(() => {
      clearKeepAliveCache()
      // Force a re-render at /b so KeepAliveOutlet re-evaluates with
      // an empty cache. (Without the re-render the DOM still shows
      // the previously rendered wrappers, but the cache is the
      // source of truth for *new* navigations.)
      root.render(<Harness initialPath="/b" />)
    })

    // After clearCache() + a fresh render at the same path, the
    // previous page (A) is gone from the DOM.
    expect(container.querySelector('[data-testid="page-a"]')).toBeNull()
    expect(container.querySelector('[data-testid="page-b"]')).not.toBeNull()
  })
})

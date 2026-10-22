/**
 * @file KeepAliveOutlet 缓存路由组件测试
 * @description 验证 KeepAliveOutlet 在路由切换时保持已访问页面挂载在 DOM 中，
 *              避免组件卸载导致的 state 丢失，以及 clearKeepAliveCache 清理缓存的行为。
 * @module tests/renderer/components
 */

import React, { useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import KeepAliveOutlet from '../../../src/renderer/src/components/KeepAliveOutlet'
import { clearKeepAliveCache } from '../../../src/renderer/src/components/keep-alive-cache'

/**
 * 这些测试通过模块级挂载计数和 useState 验证 <KeepAliveOutlet />
 * 确实将已访问页面保持在 React 树中挂载。如果在导航离开再返回时
 * 页面被重新挂载，useState 初始化器会重新运行，计数器会递增——
 * 这正是我们要防范的失败模式。
 */

/** 模块级挂载/卸载日志数组 */
let mountLog: string[] = []

/** 测试页面 A：包含计数器，用于验证状态保持 */
function PageA(): React.ReactElement {
  const [counter, setCounter] = useState(0)
  useEffect(() => {
    mountLog.push('A:mount')
    return () => {
      mountLog.push('A:unmount')
    }
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

/** 测试页面 B：初始计数器为 100，用于验证独立状态 */
function PageB(): React.ReactElement {
  const [counter, setCounter] = useState(100)
  useEffect(() => {
    mountLog.push('B:mount')
    return () => {
      mountLog.push('B:unmount')
    }
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

/** 导航栏：提供页面 A/B 的切换按钮 */
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

/**
 * 测试根组件：包含 MemoryRouter + 导航栏 + KeepAliveOutlet 路由
 *
 * @param initialPath - 初始路由路径
 */
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

/**
 * 辅助函数：在 act() 中触发点击事件
 *
 * @param el - 要点击的元素
 */
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
    expect(pageB).toBeNull()
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


    expect(pageA).not.toBeNull()
    expect(pageB).not.toBeNull()

    expect(mountLog).toEqual(['A:mount', 'B:mount'])
    expect(mountLog).not.toContain('A:unmount')

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


    click(container.querySelector('[data-testid="page-a-increment"]'))
    click(container.querySelector('[data-testid="page-a-increment"]'))
    click(container.querySelector('[data-testid="page-a-increment"]'))
    expect(container.querySelector('[data-testid="page-a-counter"]')?.textContent).toBe('3')


    click(container.querySelector('[data-testid="go-b"]'))
    click(container.querySelector('[data-testid="go-a"]'))


    expect(container.querySelector('[data-testid="page-a-counter"]')?.textContent).toBe('3')

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
    expect(allWrappers.length).toBe(2)
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

      root.render(<Harness initialPath="/b" />)
    })


    expect(container.querySelector('[data-testid="page-a"]')).toBeNull()
    expect(container.querySelector('[data-testid="page-b"]')).not.toBeNull()
  })
})

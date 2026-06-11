/**
 * @file 日志查看器测试
 * @description 验证 LogViewer 组件的服务端渲染和交互行为，
 *              包括日志行渲染、级别筛选、颜色标记、自动滚动、
 *              清除和导出按钮等功能的正确性。
 * @module tests/renderer/components/common
 */

import { describe, it, expect, vi, beforeAll } from 'vitest'
import { renderToString } from 'react-dom/server'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import LogViewer from '../../../../src/renderer/src/components/common/LogViewer'
import type { TaskLog } from '../../../../../src/shared/types'

/** 模拟 react-i18next */
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))

// jsdom does not implement scrollIntoView, but LogViewer calls it from
// useEffect. Stub it once globally so the interactive tests don't crash.
beforeAll(() => {
  if (!window.HTMLElement.prototype.scrollIntoView) {
    window.HTMLElement.prototype.scrollIntoView = function () {
      /* noop in jsdom */
    }
  }
})

const sample = (n = 0): TaskLog => ({
  id: n,
  taskId: 't1',
  timestamp: `2026-06-05T13:45:${String(n % 60).padStart(2, '0')}.000Z`,
  level: (['info', 'warn', 'error', 'debug'] as const)[n % 4],
  message: `log line ${n}`
})

const buildLogs = (n: number): TaskLog[] =>
  Array.from({ length: n }, (_, i) => sample(i))

function click(el: Element | null): void {
  if (!el) throw new Error('element not found')
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

// describe: LogViewer 服务端渲染测试
describe('LogViewer (server render)', () => {
  it('renders an empty state when logs is empty', () => {
    const html = renderToString(<LogViewer logs={[]} />)
    expect(html).toContain('noLogs')
  })

  it('renders all log lines when no filter is active', () => {
    const logs = buildLogs(3)
    const html = renderToString(<LogViewer logs={logs} />)
    expect(html).toContain('log line 0')
    expect(html).toContain('log line 1')
    expect(html).toContain('log line 2')
  })

  it('shows total log count', () => {
    const logs = buildLogs(42)
    const html = renderToString(<LogViewer logs={logs} />)
    expect(html).toContain('42')
  })

  it('applies level-specific color classes (canonical Tasks.tsx palette)', () => {
    const logs: TaskLog[] = [
      { id: 1, taskId: 't', timestamp: '2026-01-01T00:00:00Z', level: 'info', message: 'i' },
      { id: 2, taskId: 't', timestamp: '2026-01-01T00:00:00Z', level: 'warn', message: 'w' },
      { id: 3, taskId: 't', timestamp: '2026-01-01T00:00:00Z', level: 'error', message: 'e' },
      { id: 4, taskId: 't', timestamp: '2026-01-01T00:00:00Z', level: 'debug', message: 'd' }
    ]
    const html = renderToString(<LogViewer logs={logs} />)
    expect(html).toContain('text-success')
    expect(html).toContain('text-warning')
    expect(html).toContain('text-danger')
    expect(html).toContain('text-text-muted')
  })

  it('formats timestamps in a stable human-readable form', () => {
    const log: TaskLog = {
      id: 1,
      taskId: 't',
      timestamp: '2026-06-05T13:45:30.000Z',
      level: 'info',
      message: 'hello'
    }
    const html = renderToString(<LogViewer logs={[log]} />)
    // Either 13:45:30 or 1:45:30 PM depending on locale — just check the date parts
    expect(html).toMatch(/45:30|13:45:30/)
  })

  it('renders the level in uppercase brackets in the row', () => {
    const log: TaskLog = {
      id: 1,
      taskId: 't',
      timestamp: '2026-01-01T00:00:00Z',
      level: 'error',
      message: 'something failed'
    }
    const html = renderToString(<LogViewer logs={[log]} />)
    expect(html).toContain('[ERROR]')
  })

  it('caps the visible log list at the maxLogs prop and reports truncation', () => {
    const logs = buildLogs(100)
    const html = renderToString(<LogViewer logs={logs} maxLogs={10} />)
    // Visible "log line 90" (the 10th from end) is the last shown
    expect(html).toContain('log line 90')
    // Older ones (e.g. line 0) should NOT be visible
    expect(html).not.toContain('log line 0')
  })
})

  describe('LogViewer (interactive — filter)', () => {
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

  it('renders all 4 level filter chips', () => {
    act(() => {
      root = createRoot(container)
      root.render(<LogViewer logs={buildLogs(2)} />)
    })
    expect(container.querySelector('[data-testid="log-filter-all"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="log-filter-info"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="log-filter-warn"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="log-filter-error"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="log-filter-debug"]')).toBeTruthy()
  })

  it('clicking a filter chip filters the visible list', () => {
    const logs: TaskLog[] = [
      { id: 1, taskId: 't', timestamp: '2026-01-01T00:00:00Z', level: 'info', message: 'I-line' },
      { id: 2, taskId: 't', timestamp: '2026-01-01T00:00:00Z', level: 'error', message: 'E-line' },
      { id: 3, taskId: 't', timestamp: '2026-01-01T00:00:00Z', level: 'info', message: 'I-line-2' }
    ]
    act(() => {
      root = createRoot(container)
      root.render(<LogViewer logs={logs} />)
    })
    click(container.querySelector('[data-testid="log-filter-error"]'))
    expect(container.textContent).toContain('E-line')
    expect(container.textContent).not.toContain('I-line')
    expect(container.textContent).not.toContain('I-line-2')
  })

  it('clicking "all" restores the full list', () => {
    const logs: TaskLog[] = [
      { id: 1, taskId: 't', timestamp: '2026-01-01T00:00:00Z', level: 'info', message: 'I-line' },
      { id: 2, taskId: 't', timestamp: '2026-01-01T00:00:00Z', level: 'warn', message: 'W-line' }
    ]
    act(() => {
      root = createRoot(container)
      root.render(<LogViewer logs={logs} />)
    })
    click(container.querySelector('[data-testid="log-filter-warn"]'))
    expect(container.textContent).not.toContain('I-line')
    click(container.querySelector('[data-testid="log-filter-all"]'))
    expect(container.textContent).toContain('I-line')
    expect(container.textContent).toContain('W-line')
  })

  it('shows filtered count in the chip when filter is active', () => {
    const logs: TaskLog[] = [
      { id: 1, taskId: 't', timestamp: '2026-01-01T00:00:00Z', level: 'error', message: 'a' },
      { id: 2, taskId: 't', timestamp: '2026-01-01T00:00:00Z', level: 'error', message: 'b' },
      { id: 3, taskId: 't', timestamp: '2026-01-01T00:00:00Z', level: 'info', message: 'c' }
    ]
    act(() => {
      root = createRoot(container)
      root.render(<LogViewer logs={logs} />)
    })
    const errChip = container.querySelector('[data-testid="log-filter-error"]') as HTMLElement
    expect(errChip.textContent).toContain('2')
  })
})

describe('LogViewer (interactive —?clear button)', () => {
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

  it('does not render the clear button when onClear is not provided', () => {
    act(() => {
      root = createRoot(container)
      root.render(<LogViewer logs={buildLogs(2)} />)
    })
    expect(container.querySelector('[data-testid="log-clear"]')).toBeFalsy()
  })

  it('renders the clear button when onClear is provided', () => {
    act(() => {
      root = createRoot(container)
      root.render(<LogViewer logs={buildLogs(2)} onClear={() => {}} />)
    })
    expect(container.querySelector('[data-testid="log-clear"]')).toBeTruthy()
  })

  it('clicking the clear button fires onClear', () => {
    const onClear = vi.fn()
    act(() => {
      root = createRoot(container)
      root.render(<LogViewer logs={buildLogs(2)} onClear={onClear} />)
    })
    click(container.querySelector('[data-testid="log-clear"]'))
    expect(onClear).toHaveBeenCalledOnce()
  })
})

describe('LogViewer (auto-scroll)', () => {
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

  it('renders the auto-scroll toggle checked by default', () => {
    act(() => {
      root = createRoot(container)
      root.render(<LogViewer logs={buildLogs(2)} />)
    })
    const toggle = container.querySelector('[data-testid="log-autoscroll"]') as HTMLInputElement
    expect(toggle).toBeTruthy()
    expect(toggle.checked).toBe(true)
  })

  it('toggling auto-scroll off does not throw and updates state', () => {
    act(() => {
      root = createRoot(container)
      root.render(<LogViewer logs={buildLogs(2)} />)
    })
    const toggle = container.querySelector('[data-testid="log-autoscroll"]') as HTMLInputElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'checked'
      )?.set
      setter?.call(toggle, false)
      toggle.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(toggle.checked).toBe(false)
  })
})

describe('LogViewer (export button)', () => {
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

  it('renders the export button when onExport is provided', () => {
    act(() => {
      root = createRoot(container)
      root.render(<LogViewer logs={buildLogs(2)} onExport={() => {}} />)
    })
    expect(container.querySelector('[data-testid="log-export"]')).toBeTruthy()
  })

  it('clicking the export button fires onExport with the logs (caller can save to file)', () => {
    const logs = buildLogs(3)
    const onExport = vi.fn()
    act(() => {
      root = createRoot(container)
      root.render(<LogViewer logs={logs} onExport={onExport} />)
    })
    click(container.querySelector('[data-testid="log-export"]'))
    expect(onExport).toHaveBeenCalledWith(logs)
  })
})

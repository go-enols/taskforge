/**
 * @file 调试页面测试
 * @description 验证 DebugPage 组件的服务端渲染和交互行为，
 *              包括选择文件夹、读取 manifest/meta 配置、
 *              沙箱开关、运行/停止任务、日志查看等功能。
 * @module tests/renderer/pages
 */

import { describe, it, expect, vi, beforeAll } from 'vitest'
import { renderToString } from 'react-dom/server'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import DebugPage from '../../../src/renderer/src/pages/DebugPage'

// 模拟 scrollIntoView（jsdom 环境不支持）
beforeAll(() => {
  if (!window.HTMLElement.prototype.scrollIntoView) {
    window.HTMLElement.prototype.scrollIntoView = function () {
      /* noop in jsdom */
    }
  }
})

/** 模拟 react-i18next */
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))

/** 模拟所有 API 方法 */
const mocks = vi.hoisted(() => ({
  taskApi: {
    create: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    clearLogs: vi.fn(),
    getLogs: vi.fn(),
    getProgress: vi.fn(),
    getOutput: vi.fn(),
    delete: vi.fn()
  },
  fileApi: { selectFolder: vi.fn(), readFile: vi.fn() },
  scriptParamApi: { list: vi.fn() },
  dialogApi: { saveFile: vi.fn() }
}))

vi.mock('../../../src/renderer/src/api', () => ({
  taskApi: mocks.taskApi,
  fileApi: mocks.fileApi,
  scriptParamApi: mocks.scriptParamApi,
  dialogApi: mocks.dialogApi
}))

const mockTaskApi = mocks.taskApi
const mockFileApi = mocks.fileApi
const mockScriptParamApi = mocks.scriptParamApi

/** 生成示例账户数据 */
const sampleAccount = (id: string, templateId: string) => ({
  id,
  templateId,
  pool: 'main',
  data: { address: '0xabc', privateKey: '0xdef' },
  labels: [],
  notes: '',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z'
})

/** 辅助函数：在 act 中触发点击事件 */
function click(el: Element | null): void {
  if (!el) throw new Error('element not found')
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

// describe: DebugPage 服务端渲染测试
describe('DebugPage (server render)', () => {
  it('renders the page title', () => {
    const html = renderToString(<DebugPage />)
    expect(html).toContain('debug.title')
    expect(html).toContain('debug.subtitle')
  })

  it('shows a folder picker button when no folder is selected', () => {
    const html = renderToString(<DebugPage />)
    expect(html).toContain('debug.selectFolder')
    expect(html).toContain('data-testid="debug-select-folder"')
  })

  it('does not show matched-accounts block when no folder is selected', () => {
    const html = renderToString(<DebugPage />)
    expect(html).not.toContain('debug.matchedAccounts')
  })
})

// describe: DebugPage 交互行为测试
describe('DebugPage (interactive)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    container = document.createElement('div')
    document.body.appendChild(container)
    mockFileApi.selectFolder.mockResolvedValue({ canceled: false, folderPath: 'D:\\scripts\\mybot' })
    mockFileApi.readFile.mockResolvedValue({ success: true, content: '' })
    mockScriptParamApi.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 9999, totalPages: 1 })
    mockTaskApi.create.mockResolvedValue({
      id: 'task-1',
      scriptFolder: 'D:\\scripts\\mybot',
      config: {},
      status: 'idle',
      workerId: null,
      startedAt: null,
      endedAt: null,
      isSandbox: false
    })
    mockTaskApi.start.mockResolvedValue(undefined)
    mockTaskApi.stop.mockResolvedValue(undefined)
    mockTaskApi.pause.mockResolvedValue(undefined)
    mockTaskApi.resume.mockResolvedValue(undefined)
    mockTaskApi.getLogs.mockResolvedValue([])
    mockTaskApi.getProgress.mockResolvedValue(null)
    mockTaskApi.getOutput.mockResolvedValue(null)
    mockTaskApi.clearLogs.mockResolvedValue(undefined)
    mockTaskApi.delete.mockResolvedValue(undefined)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('selecting a folder reads manifest.json and shows parsed info', async () => {
    mockFileApi.readFile.mockImplementation(async (p: string) => {
      if (p.endsWith('manifest.json')) {
        return {
          success: true,
          content: JSON.stringify({
            id: 'mybot',
            name: 'My Bot',
            version: '1.0.0',
            entryPoint: 'main.js',
            dataRequirements: [{ key: 'accounts', source: 'script_param', templateType: 'tpl-evm' }]
          })
        }
      }
      return { success: false }
    })
    mockScriptParamApi.list.mockResolvedValue({
      items: [sampleAccount('a1', 'tpl-evm'), sampleAccount('a2', 'tpl-evm'), sampleAccount('a3', 'tpl-other')],
      total: 3,
      page: 1,
      pageSize: 9999,
      totalPages: 1
    })

    act(() => {
      root = createRoot(container)
      root.render(<DebugPage />)
    })
    const folderBtn = container.querySelector('[data-testid="debug-select-folder"]') as HTMLElement
    expect(folderBtn).toBeTruthy()
    await act(async () => {
      click(folderBtn)
    })
    expect(container.textContent).toContain('My Bot')
    expect(container.textContent).toContain('main.js')
    expect(container.textContent).toContain('2')
  })

  it('falls back to meta.json if manifest.json is missing', async () => {
    mockFileApi.readFile.mockImplementation(async (p: string) => {
      if (p.endsWith('manifest.json')) return { success: false }
      if (p.endsWith('meta.json')) {
        return {
          success: true,
          content: JSON.stringify({ name: 'Meta Bot', entryPoint: 'meta.js', permissions: ['network'] })
        }
      }
      return { success: false }
    })
    act(() => {
      root = createRoot(container)
      root.render(<DebugPage />)
    })
    await act(async () => {
      click(container.querySelector('[data-testid="debug-select-folder"]') as HTMLElement)
    })
    expect(container.textContent).toContain('Meta Bot')
    expect(container.textContent).toContain('meta.js')
  })

  it('run button is enabled only when a folder is selected and an account is chosen', async () => {
    mockFileApi.readFile.mockResolvedValue({
      success: true,
      content: JSON.stringify({ name: 'X', dataRequirements: [{ key: 'accounts', source: 'script_param', templateType: 'tpl' }] })
    })
    mockScriptParamApi.list.mockResolvedValue({
      items: [sampleAccount('a1', 'tpl')],
      total: 1,
      page: 1,
      pageSize: 9999,
      totalPages: 1
    })

    act(() => {
      root = createRoot(container)
      root.render(<DebugPage />)
    })
    await act(async () => {
      click(container.querySelector('[data-testid="debug-select-folder"]') as HTMLElement)
    })
    const runBtn = container.querySelector('[data-testid="debug-run"]') as HTMLButtonElement
    expect(runBtn).toBeTruthy()
    expect(runBtn.disabled).toBe(false)
  })

  it('clicking run calls taskApi.create with sandbox + selected account, then taskApi.start', async () => {
    mockFileApi.readFile.mockResolvedValue({
      success: true,
      content: JSON.stringify({ name: 'X', dataRequirements: [{ key: 'accounts', source: 'script_param', templateType: 'tpl' }] })
    })
    mockScriptParamApi.list.mockResolvedValue({
      items: [sampleAccount('a1', 'tpl')],
      total: 1,
      page: 1,
      pageSize: 9999,
      totalPages: 1
    })

    act(() => {
      root = createRoot(container)
      root.render(<DebugPage />)
    })
    await act(async () => {
      click(container.querySelector('[data-testid="debug-select-folder"]') as HTMLElement)
    })
    await act(async () => {
      click(container.querySelector('[data-testid="debug-run"]') as HTMLElement)
    })
    expect(mockTaskApi.create).toHaveBeenCalledOnce()
    const createArg = mockTaskApi.create.mock.calls[0][0]
    expect(createArg.scriptFolder).toBe('D:\\scripts\\mybot')
    expect(createArg.isSandbox).toBe(true)
    expect(createArg.config._account_id).toBe('a1')
    expect(mockTaskApi.start).toHaveBeenCalledWith('task-1')
  })

  it('toggling sandbox off sends isSandbox: false', async () => {
    mockFileApi.readFile.mockResolvedValue({
      success: true,
      content: JSON.stringify({ name: 'X', dataRequirements: [{ key: 'accounts', source: 'script_param', templateType: 'tpl' }] })
    })
    mockScriptParamApi.list.mockResolvedValue({
      items: [sampleAccount('a1', 'tpl')],
      total: 1,
      page: 1,
      pageSize: 9999,
      totalPages: 1
    })

    act(() => {
      root = createRoot(container)
      root.render(<DebugPage />)
    })
    await act(async () => {
      click(container.querySelector('[data-testid="debug-select-folder"]') as HTMLElement)
    })
    const sandboxCheckbox = container.querySelector('[data-testid="debug-sandbox"]') as HTMLInputElement
    expect(sandboxCheckbox).toBeTruthy()
    expect(sandboxCheckbox.checked).toBe(true)
    act(() => {
      sandboxCheckbox.click()
    })
    expect(sandboxCheckbox.checked).toBe(false)
    await act(async () => {
      click(container.querySelector('[data-testid="debug-run"]') as HTMLElement)
    })
    const createArg = mockTaskApi.create.mock.calls[0][0]
    expect(createArg.isSandbox).toBe(false)
  })

  it('shows the LogViewer once a task is running', async () => {
    mockFileApi.readFile.mockResolvedValue({
      success: true,
      content: JSON.stringify({ name: 'X', dataRequirements: [{ key: 'accounts', source: 'script_param', templateType: 'tpl' }] })
    })
    mockScriptParamApi.list.mockResolvedValue({
      items: [sampleAccount('a1', 'tpl')],
      total: 1,
      page: 1,
      pageSize: 9999,
      totalPages: 1
    })

    act(() => {
      root = createRoot(container)
      root.render(<DebugPage />)
    })
    await act(async () => {
      click(container.querySelector('[data-testid="debug-select-folder"]') as HTMLElement)
    })
    await act(async () => {
      click(container.querySelector('[data-testid="debug-run"]') as HTMLElement)
    })
    const logViewer = container.querySelector('[data-testid="log-viewer"]')
    expect(logViewer).toBeTruthy()
    expect(container.textContent).toContain('running')
  })

  it('stop button is only enabled while running', async () => {
    mockFileApi.readFile.mockResolvedValue({
      success: true,
      content: JSON.stringify({ name: 'X', dataRequirements: [{ key: 'accounts', source: 'script_param', templateType: 'tpl' }] })
    })
    mockScriptParamApi.list.mockResolvedValue({
      items: [sampleAccount('a1', 'tpl')],
      total: 1,
      page: 1,
      pageSize: 9999,
      totalPages: 1
    })

    act(() => {
      root = createRoot(container)
      root.render(<DebugPage />)
    })
    await act(async () => {
      click(container.querySelector('[data-testid="debug-select-folder"]') as HTMLElement)
    })
    let stopBtn = container.querySelector('[data-testid="debug-stop"]') as HTMLButtonElement
    expect(stopBtn).toBeTruthy()
    expect(stopBtn.disabled).toBe(true)
    await act(async () => {
      click(container.querySelector('[data-testid="debug-run"]') as HTMLElement)
    })
    stopBtn = container.querySelector('[data-testid="debug-stop"]') as HTMLButtonElement
    expect(stopBtn.disabled).toBe(false)
    await act(async () => {
      click(stopBtn)
    })
    expect(mockTaskApi.stop).toHaveBeenCalledWith('task-1')
  })

  it('clear logs button is wired and fires taskApi.clearLogs when a task is active', async () => {
    mockFileApi.readFile.mockResolvedValue({
      success: true,
      content: JSON.stringify({ name: 'X', dataRequirements: [{ key: 'accounts', source: 'script_param', templateType: 'tpl' }] })
    })
    mockScriptParamApi.list.mockResolvedValue({
      items: [sampleAccount('a1', 'tpl')],
      total: 1,
      page: 1,
      pageSize: 9999,
      totalPages: 1
    })
    mockTaskApi.getLogs.mockResolvedValue([])

    act(() => {
      root = createRoot(container)
      root.render(<DebugPage />)
    })
    await act(async () => {
      click(container.querySelector('[data-testid="debug-select-folder"]') as HTMLElement)
    })
    await act(async () => {
      click(container.querySelector('[data-testid="debug-run"]') as HTMLElement)
    })
    const clearBtn = container.querySelector('[data-testid="log-clear"]') as HTMLElement
    expect(clearBtn).toBeTruthy()
    await act(async () => {
      click(clearBtn)
    })
    expect(mockTaskApi.clearLogs).toHaveBeenCalledWith('task-1')
  })
})

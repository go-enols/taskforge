/**
 * @file TasksSection 任务区块测试
 * @description 验证 TasksSection 组件的服务端渲染和交互行为，
 *              包括任务列表渲染、添加/删除任务、更新任务状态等功能。
 * @module tests/renderer/airdrops/AirdropFormSections
 */

import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import TasksSection from '../../../../src/renderer/src/components/airdrops/AirdropFormSections/TasksSection'
import type { AirdropFormData, AirdropTaskFormData } from '../../../../src/renderer/src/components/airdrops/airdrop-defaults'

/** 模拟 react-i18next */
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))

const baseForm = (overrides: Partial<AirdropFormData> = {}): AirdropFormData => ({
  name: '',
  website: '',
  description: '',
  scriptTemplateId: '',
  accountPool: '',
  status: 'ongoing',
  projectType: 'testnet',
  tags: '',
  labels: '',
  links: [],
  eligibilityCriteria: [],
  tasks: [],
  earnings: [],
  templateId: '',
  customFields: {},
  ...overrides
})

const sampleTask: AirdropTaskFormData = {
  id: 't1',
  title: 'Bridge to L1',
  description: 'Use Orbiter',
  deadline: '2026-07-01',
  status: 'pending',
  notes: 'low fee window'
}

// describe: TasksSection 服务端渲染测试
describe('TasksSection (server render)', () => {
  it('shows empty hint when no tasks', () => {
    const html = renderToString(<TasksSection form={baseForm()} onChange={() => {}} />)
    expect(html).toContain('noTasks')
  })

  it('renders a task row with title, description, status, deadline, notes', () => {
    const html = renderToString(
      <TasksSection form={baseForm({ tasks: [sampleTask] })} onChange={() => {}} />
    )
    expect(html).toContain('Bridge to L1')
    expect(html).toContain('Use Orbiter')
    expect(html).toContain('low fee window')
  })

  it('renders add task button', () => {
    const html = renderToString(<TasksSection form={baseForm()} onChange={() => {}} />)
    expect(html).toContain('addTask')
  })
})

// describe: TasksSection 交互行为测试
describe('TasksSection (interactive)', () => {
  let container: HTMLDivElement
  let root: Root

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  it('clicking addTask fires onChange with one more empty task', () => {
    const onChange = vi.fn()
    act(() => {
      root = createRoot(container)
      root.render(<TasksSection form={baseForm()} onChange={onChange} />)
    })
    const addBtn = container.querySelector('[data-testid="tasks-section-add"]') as HTMLElement
    act(() => {
      addBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as AirdropFormData
    expect(last.tasks).toHaveLength(1)
    expect(last.tasks[0].title).toBe('')
    expect(last.tasks[0].status).toBe('pending')
    expect(last.tasks[0].id).toBeTruthy()
  })

  it('clicking remove fires onChange with one fewer task', () => {
    const onChange = vi.fn()
    act(() => {
      root = createRoot(container)
      root.render(
        <TasksSection form={baseForm({ tasks: [sampleTask] })} onChange={onChange} />
      )
    })
    const removeBtn = container.querySelector('[data-testid="tasks-section-remove-0"]') as HTMLElement
    act(() => {
      removeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as AirdropFormData
    expect(last.tasks).toHaveLength(0)
  })

  it('updating task status fires onChange with new status', () => {
    const onChange = vi.fn()
    act(() => {
      root = createRoot(container)
      root.render(
        <TasksSection form={baseForm({ tasks: [sampleTask] })} onChange={onChange} />
      )
    })
    const statusSelect = container.querySelector('select[name="tasks.0.status"]') as HTMLSelectElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(statusSelect.constructor.prototype, 'value')?.set
      setter?.call(statusSelect, 'completed')
      statusSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as AirdropFormData
    expect(last.tasks[0].status).toBe('completed')
  })
})

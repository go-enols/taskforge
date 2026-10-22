/**
 * @file BasicInfoSection 组件测试
 * @description 测试空投表单基本信息区块（BasicInfoSection）：服务端渲染（名称、网站、链、描述字段及必填标记、Markdown 提示、错误信息）
 *              以及交互行为（名称字段变化触发 onChange）。
 * @module tests/renderer/airdrops/AirdropFormSections
 */

import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import BasicInfoSection from '../../../../src/renderer/src/components/airdrops/AirdropFormSections/BasicInfoSection'
import type { AirdropFormData } from '../../../../src/renderer/src/components/airdrops/airdrop-defaults'

// 模拟 react-i18next，返回 key 作为翻译结果
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))

/** 构造包含基本字段的默认表单数据 */
const baseForm = (overrides: Partial<AirdropFormData> = {}): AirdropFormData => ({
  name: 'Hyperliquid',
  website: 'https://app.hyperliquid.xyz',
  description: 'Testnet points',
  scriptTemplateId: '',
  accountPool: 'main',
  status: 'ongoing',
  projectType: 'testnet',
  tags: 'L1, points',
  labels: '',
  links: [],
  eligibilityCriteria: [],
  tasks: [],
  earnings: [],
  templateId: '',
  customFields: {},
  ...overrides
})

/** 辅助函数：在 act 中修改输入框的值并触发 input 事件 */
function change(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value')?.set
    setter?.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

// describe: 服务端渲染测试 — 验证 BasicInfoSection 的渲染输出
describe('BasicInfoSection (server render)', () => {
  // 用例：渲染名称、网站、链和描述字段
  it('renders name, website and description fields', () => {
    const html = renderToString(
      <BasicInfoSection form={baseForm()} onChange={() => {}} errors={{}} />
    )
    expect(html).toContain('Hyperliquid')
    expect(html).toContain('https://app.hyperliquid.xyz')
    expect(html).toContain('Testnet points')
  })

  // 用例：名称字段标记为必填（带星号）
  it('marks name with required asterisk', () => {
    const html = renderToString(
      <BasicInfoSection form={baseForm()} onChange={() => {}} errors={{}} />
    )
    // name label contains " *"
    expect(html).toMatch(/name.*\*/i)
  })

  // 用例：网站字段标记为必填（带星号）
  it('marks website with required asterisk', () => {
    const html = renderToString(
      <BasicInfoSection form={baseForm()} onChange={() => {}} errors={{}} />
    )
    expect(html).toMatch(/website.*\*/i)
  })

  // 用例：描述字段渲染为 textarea
  it('renders description as textarea', () => {
    const html = renderToString(
      <BasicInfoSection form={baseForm()} onChange={() => {}} errors={{}} />
    )
    expect(html).toMatch(/<textarea/i)
  })

  // 用例：显示 Markdown 支持提示（MarkdownEditor 自带提示，旧的 descriptionMarkdownHint 已移除）
  it('shows markdown hint', () => {
    const html = renderToString(
      <BasicInfoSection form={baseForm()} onChange={() => {}} errors={{}} />
    )
    expect(html).toContain('markdownEditor.markdownSupported')
  })

  // 用例：name 字段显示错误信息
  it('shows error message for name field', () => {
    const html = renderToString(
      <BasicInfoSection form={baseForm({ name: '' })} onChange={() => {}} errors={{ name: 'required' }} />
    )
    expect(html).toContain('required')
  })
})

// describe: 交互测试 — 验证 BasicInfoSection 的事件回调
describe('BasicInfoSection (interactive)', () => {
  let container: HTMLDivElement
  let root: Root

  // 每次测试后卸载根节点并移除容器
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  // 每次测试前创建 DOM 容器
  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  // 用例：修改名称字段触发 onChange 并传递完整的新 formData
  it('calls onChange with full new formData when name field changes', () => {
    const onChange = vi.fn()
    act(() => {
      root = createRoot(container)
      root.render(<BasicInfoSection form={baseForm()} onChange={onChange} errors={{}} />)
    })
    const nameInput = container.querySelector('input[name="name"]') as HTMLInputElement
    change(nameInput, 'NewName')
    expect(onChange).toHaveBeenCalled()
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as AirdropFormData
    expect(lastCall.name).toBe('NewName')
  })
})

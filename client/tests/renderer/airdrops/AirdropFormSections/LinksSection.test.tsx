/**
 * @file LinksSection 链接区块测试
 * @description 验证 LinksSection 组件的服务端渲染和交互行为，
 *              包括链接列表渲染、添加/删除链接、编辑标签等。
 * @module tests/renderer/airdrops/AirdropFormSections
 */

import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import LinksSection from '../../../../src/renderer/src/components/airdrops/AirdropFormSections/LinksSection'
import type { AirdropFormData, AirdropLinkFormData } from '../../../../src/renderer/src/components/airdrops/airdrop-defaults'

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

const twoLinks: AirdropLinkFormData[] = [
  { label: 'Docs', url: 'https://docs.x' },
  { label: 'Twitter', url: 'https://twitter.com/x' }
]

// describe: LinksSection 服务端渲染测试
describe('LinksSection (server render)', () => {
  it('shows empty hint when no links', () => {
    const html = renderToString(<LinksSection form={baseForm()} onChange={() => {}} />)
    expect(html).toContain('noLinks')
  })

  it('renders all link rows with label + url inputs', () => {
    const html = renderToString(<LinksSection form={baseForm({ links: twoLinks })} onChange={() => {}} />)
    expect(html).toContain('Docs')
    expect(html).toContain('https://docs.x')
    expect(html).toContain('Twitter')
  })

  it('renders the "add link" button', () => {
    const html = renderToString(<LinksSection form={baseForm()} onChange={() => {}} />)
    expect(html).toContain('addLink')
  })
})

// describe: LinksSection 交互行为测试
describe('LinksSection (interactive)', () => {
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

  it('clicking addLink button fires onChange with one more empty link', () => {
    const onChange = vi.fn()
    act(() => {
      root = createRoot(container)
      root.render(<LinksSection form={baseForm()} onChange={onChange} />)
    })
    const addBtn = container.querySelector('[data-testid="links-section-add"]') as HTMLElement
    act(() => {
      addBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(onChange).toHaveBeenCalled()
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as AirdropFormData
    expect(last.links).toHaveLength(1)
    expect(last.links[0]).toEqual({ label: '', url: '' })
  })

  it('clicking remove on first link fires onChange with one fewer link', () => {
    const onChange = vi.fn()
    act(() => {
      root = createRoot(container)
      root.render(<LinksSection form={baseForm({ links: twoLinks })} onChange={onChange} />)
    })
    const removeBtn = container.querySelector('[data-testid="links-section-remove-0"]') as HTMLElement
    act(() => {
      removeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as AirdropFormData
    expect(last.links).toHaveLength(1)
    expect(last.links[0]).toEqual(twoLinks[1])
  })

  it('updating label of first link fires onChange with new label', () => {
    const onChange = vi.fn()
    act(() => {
      root = createRoot(container)
      root.render(<LinksSection form={baseForm({ links: twoLinks })} onChange={onChange} />)
    })
    const labelInput = container.querySelector('input[name="links.0.label"]') as HTMLInputElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(labelInput.constructor.prototype, 'value')?.set
      setter?.call(labelInput, 'NewLabel')
      labelInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as AirdropFormData
    expect(last.links[0].label).toBe('NewLabel')
  })
})

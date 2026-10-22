/**
 * @file TagsSection 标签和标签区块测试
 * @description 验证 TagsSection 组件的服务端渲染和交互行为，
 *              包括标签和标签文字的渲染、占位提示、编辑标签等功能。
 * @module tests/renderer/airdrops/AirdropFormSections
 */

import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import TagsSection from '../../../../src/renderer/src/components/airdrops/AirdropFormSections/TagsSection'
import type { AirdropFormData } from '../../../../src/renderer/src/components/airdrops/airdrop-defaults'

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
  tags: 'L1, points, airdrop',
  labels: 'priority',
  links: [],
  eligibilityCriteria: [],
  tasks: [],
  earnings: [],
  templateId: '',
  customFields: {},
  ...overrides
})

// describe: TagsSection 服务端渲染测试
describe('TagsSection (server render)', () => {
  it('renders tags and labels as comma-separated text', () => {
    const html = renderToString(<TagsSection form={baseForm()} onChange={() => {}} />)
    expect(html).toContain('L1, points, airdrop')
    expect(html).toContain('priority')
  })

  it('shows placeholder hints', () => {
    const html = renderToString(
      <TagsSection form={baseForm({ tags: '', labels: '' })} onChange={() => {}} />
    )
    expect(html).toContain('tagsPlaceholder')
    expect(html).toContain('labelsPlaceholder')
  })
})

// describe: TagsSection 交互行为测试
describe('TagsSection (interactive)', () => {
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

  it('updating tags fires onChange with new tags string', () => {
    const onChange = vi.fn()
    act(() => {
      root = createRoot(container)
      root.render(<TagsSection form={baseForm()} onChange={onChange} />)
    })
    const tagsInput = container.querySelector('input[name="tags"]') as HTMLInputElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(tagsInput.constructor.prototype, 'value')?.set
      setter?.call(tagsInput, 'newTag1, newTag2')
      tagsInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as AirdropFormData
    expect(last.tags).toBe('newTag1, newTag2')
  })
})

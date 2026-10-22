/**
 * @file EligibilitySection 资格条件区块测试
 * @description 验证 EligibilitySection 组件的服务端渲染和交互行为，
 *              包括资格条件列表渲染、添加条件、切换必填状态等功能。
 * @module tests/renderer/airdrops/AirdropFormSections
 */

import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import EligibilitySection from '../../../../src/renderer/src/components/airdrops/AirdropFormSections/EligibilitySection'
import type { AirdropFormData, AirdropEligibilityFormData } from '../../../../src/renderer/src/components/airdrops/airdrop-defaults'

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

const sample: AirdropEligibilityFormData = {
  id: 'e1',
  description: 'Min 10 txs',
  requirementType: 'txCount',
  requirementValue: '10',
  required: true,
  met: false,
  notes: 'tracked weekly'
}

// describe: EligibilitySection 服务端渲染测试
describe('EligibilitySection (server render)', () => {
  it('shows empty hint when no criteria', () => {
    const html = renderToString(<EligibilitySection form={baseForm()} onChange={() => {}} />)
    expect(html).toContain('noEligibility')
  })

  it('renders criterion with description, type, value, required, met, notes', () => {
    const html = renderToString(
      <EligibilitySection form={baseForm({ eligibilityCriteria: [sample] })} onChange={() => {}} />
    )
    expect(html).toContain('Min 10 txs')
    expect(html).toContain('txCount')
    expect(html).toContain('10')
    expect(html).toContain('tracked weekly')
  })

  it('renders add criterion button', () => {
    const html = renderToString(<EligibilitySection form={baseForm()} onChange={() => {}} />)
    expect(html).toContain('addEligibility')
  })
})

// describe: EligibilitySection 交互行为测试
describe('EligibilitySection (interactive)', () => {
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

  it('clicking add fires onChange with one more empty criterion', () => {
    const onChange = vi.fn()
    act(() => {
      root = createRoot(container)
      root.render(<EligibilitySection form={baseForm()} onChange={onChange} />)
    })
    const addBtn = container.querySelector('[data-testid="eligibility-section-add"]') as HTMLElement
    act(() => {
      addBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as AirdropFormData
    expect(last.eligibilityCriteria).toHaveLength(1)
    expect(last.eligibilityCriteria[0].description).toBe('')
    expect(last.eligibilityCriteria[0].required).toBe(false)
    expect(last.eligibilityCriteria[0].met).toBe(false)
    expect(last.eligibilityCriteria[0].id).toBeTruthy()
  })

  it('toggling required fires onChange with new required value', () => {
    const onChange = vi.fn()
    act(() => {
      root = createRoot(container)
      root.render(
        <EligibilitySection form={baseForm({ eligibilityCriteria: [sample] })} onChange={onChange} />
      )
    })
    const reqCheckbox = container.querySelector('input[type="checkbox"][name="eligibility.0.required"]') as HTMLInputElement
    expect(reqCheckbox).toBeTruthy()
    act(() => {
      // Use the prototype's checked setter so React's synthetic event system detects the change.
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'checked'
      )?.set
      setter?.call(reqCheckbox, false)
      reqCheckbox.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }))
      reqCheckbox.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onChange).toHaveBeenCalled()
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as AirdropFormData
    expect(last.eligibilityCriteria[0].required).toBe(false)
  })
})

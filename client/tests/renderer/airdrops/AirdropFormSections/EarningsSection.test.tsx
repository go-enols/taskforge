/**
 * @file EarningsSection 收益区块测试
 * @description 验证 EarningsSection 组件的服务端渲染和交互行为，
 *              包括收益列表渲染、添加收益、编辑金额等功能。
 * @module tests/renderer/airdrops/AirdropFormSections
 */

import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import EarningsSection from '../../../../src/renderer/src/components/airdrops/AirdropFormSections/EarningsSection'
import type { AirdropFormData, AirdropEarningFormData } from '../../../../src/renderer/src/components/airdrops/airdrop-defaults'

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

const sampleEarning: AirdropEarningFormData = {
  id: 'e1',
  token: 'ARB',
  amount: 100,
  valueUsd: 200,
  date: '2026-05-01',
  notes: 'season 1'
}

// describe: EarningsSection 服务端渲染测试
describe('EarningsSection (server render)', () => {
  it('shows empty hint when no earnings', () => {
    const html = renderToString(<EarningsSection form={baseForm()} onChange={() => {}} />)
    expect(html).toContain('noEarnings')
  })

  it('renders earning row with token, amount, valueUsd, date, notes', () => {
    const html = renderToString(
      <EarningsSection form={baseForm({ earnings: [sampleEarning] })} onChange={() => {}} />
    )
    expect(html).toContain('ARB')
    expect(html).toContain('100')
    expect(html).toContain('200')
    expect(html).toContain('2026-05-01')
    expect(html).toContain('season 1')
  })

  it('renders add earning button', () => {
    const html = renderToString(<EarningsSection form={baseForm()} onChange={() => {}} />)
    expect(html).toContain('addEarning')
  })
})

// describe: EarningsSection 交互行为测试
describe('EarningsSection (interactive)', () => {
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

  it('clicking addEarning fires onChange with one more empty earning', () => {
    const onChange = vi.fn()
    act(() => {
      root = createRoot(container)
      root.render(<EarningsSection form={baseForm()} onChange={onChange} />)
    })
    const addBtn = container.querySelector('[data-testid="earnings-section-add"]') as HTMLElement
    act(() => {
      addBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as AirdropFormData
    expect(last.earnings).toHaveLength(1)
    expect(last.earnings[0].token).toBe('')
    expect(last.earnings[0].amount).toBe(0)
    expect(last.earnings[0].date).toBeTruthy()
  })

  it('updating amount parses number from string', () => {
    const onChange = vi.fn()
    act(() => {
      root = createRoot(container)
      root.render(
        <EarningsSection form={baseForm({ earnings: [sampleEarning] })} onChange={onChange} />
      )
    })
    const amountInput = container.querySelector('input[name="earnings.0.amount"]') as HTMLInputElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(amountInput.constructor.prototype, 'value')?.set
      setter?.call(amountInput, '250')
      amountInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as AirdropFormData
    expect(last.earnings[0].amount).toBe(250)
  })
})

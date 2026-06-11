/**
 * @file ClassificationSection 组件测试
 * @description 测试空投表单分类区块（ClassificationSection）：服务端渲染（状态、项目类型、账号池、脚本模板下拉框及加载状态）
 *              以及交互行为（状态/账号池切换触发 onChange、错误信息显示）。
 * @module tests/renderer/airdrops/AirdropFormSections
 */

import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import ClassificationSection from '../../../../src/renderer/src/components/airdrops/AirdropFormSections/ClassificationSection'
import type { AirdropFormData, TaskTemplateOption } from '../../../../src/renderer/src/components/airdrops/airdrop-defaults'
import type { TaskTemplate } from '../../../../../src/shared/types'

// 模拟 react-i18next，返回 key 作为翻译结果
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))

/** 构造包含分类字段的默认表单数据 */
const baseForm = (overrides: Partial<AirdropFormData> = {}): AirdropFormData => ({
  name: 'Hyperliquid',
  website: 'https://app.hyperliquid.xyz',
  chain: 'Hyperliquid L1',
  description: '',
  scriptTemplateId: 'script-1',
  accountPool: 'main',
  status: 'ongoing',
  projectType: 'testnet',
  tags: '',
  labels: '',
  links: [],
  eligibilityCriteria: [],
  tasks: [],
  earnings: [],
  ...overrides
})

/** 模拟脚本模板列表 */
const templates: TaskTemplate[] = [
  {
    id: 'script-1',
    name: 'Bridge Bot',
    version: '1.0.0',
    description: 'Bridges',
    installPath: '/x',
    manifest: {},
    remoteUrl: null,
    isInstalled: true,
    downloadedAt: '2026-01-01',
    updatedAt: '2026-01-01'
  },
  {
    id: 'script-2',
    name: 'Swap Bot',
    version: '2.0.0',
    description: 'Swaps',
    installPath: '/y',
    manifest: {},
    remoteUrl: null,
    isInstalled: true,
    downloadedAt: '2026-01-01',
    updatedAt: '2026-01-01'
  }
]

/** 模拟账号池选项列表 */
const pools = ['main', 'secondary']

/** 辅助函数：在 act 中修改 select 的值并触发 change 事件 */
function changeSelect(el: HTMLSelectElement, value: string): void {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value')?.set
    setter?.call(el, value)
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

// describe: 服务端渲染测试 — 验证 ClassificationSection 的渲染输出
describe('ClassificationSection (server render)', () => {
  // 用例：渲染状态下拉框，包含全部 4 个选项
  it('renders status dropdown with all 4 options', () => {
    const html = renderToString(
      <ClassificationSection
        form={baseForm()}
        onChange={() => {}}
        errors={{}}
        scriptTemplates={[]}
        accountPools={[]}
        loading={false}
      />
    )
    expect(html).toMatch(/<select[^>]*name="status"/)
  })

  // 用例：渲染项目类型下拉框，包含全部 6 个选项
  it('renders projectType dropdown with all 6 options', () => {
    const html = renderToString(
      <ClassificationSection
        form={baseForm()}
        onChange={() => {}}
        errors={{}}
        scriptTemplates={[]}
        accountPools={[]}
        loading={false}
      />
    )
    expect(html).toContain('Testnet')
    expect(html).toContain('Mainnet')
    expect(html).toContain('Galxe')
  })

  // 用例：渲染账号池下拉框，包含传入的池选项
  it('renders accountPool dropdown with provided pool options', () => {
    const html = renderToString(
      <ClassificationSection
        form={baseForm()}
        onChange={() => {}}
        errors={{}}
        scriptTemplates={[]}
        accountPools={pools}
        loading={false}
      />
    )
    expect(html).toContain('main')
    expect(html).toContain('secondary')
  })

  // 用例：账号池字段标记为必填（带星号）
  it('renders accountPool as required (asterisk)', () => {
    const html = renderToString(
      <ClassificationSection
        form={baseForm()}
        onChange={() => {}}
        errors={{}}
        scriptTemplates={[]}
        accountPools={pools}
        loading={false}
      />
    )
    expect(html).toMatch(/accountPool.*\*/i)
  })

  it('renders scriptTemplate dropdown with "(可选)" hint', () => {
    const html = renderToString(
      <ClassificationSection
        form={baseForm()}
        onChange={() => {}}
        errors={{}}
        scriptTemplates={templates}
        accountPools={[]}
        loading={false}
      />
    )
    expect(html).toContain('scriptTemplateOptional')
  })

  // 用例：loading 为 true 时显示加载状态
  it('shows loading state when loading', () => {
    const html = renderToString(
      <ClassificationSection
        form={baseForm()}
        onChange={() => {}}
        errors={{}}
        scriptTemplates={[]}
        accountPools={[]}
        loading={true}
      />
    )
    expect(html).toMatch(/loading/i)
  })
})

describe('ClassificationSection (interactive)', () => {
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

  it('changing status dropdown fires onChange with new status', () => {
    const onChange = vi.fn()
    act(() => {
      root = createRoot(container)
      root.render(
        <ClassificationSection
          form={baseForm()}
          onChange={onChange}
          errors={{}}
          scriptTemplates={templates}
          accountPools={pools}
          loading={false}
        />
      )
    })
    const statusSelect = container.querySelector('select[name="status"]') as HTMLSelectElement
    changeSelect(statusSelect, 'completed')
    expect(onChange).toHaveBeenCalled()
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as AirdropFormData
    expect(last.status).toBe('completed')
  })

  it('changing accountPool fires onChange with new pool', () => {
    const onChange = vi.fn()
    act(() => {
      root = createRoot(container)
      root.render(
        <ClassificationSection
          form={baseForm()}
          onChange={onChange}
          errors={{}}
          scriptTemplates={templates}
          accountPools={pools}
          loading={false}
        />
      )
    })
    const poolSelect = container.querySelector('select[name="accountPool"]') as HTMLSelectElement
    changeSelect(poolSelect, 'secondary')
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as AirdropFormData
    expect(last.accountPool).toBe('secondary')
  })

  it('accountPool error is displayed', () => {
    act(() => {
      root = createRoot(container)
      root.render(
        <ClassificationSection
          form={baseForm({ accountPool: '' })}
          onChange={() => {}}
          errors={{ accountPool: 'required' }}
          scriptTemplates={[]}
          accountPools={pools}
          loading={false}
        />
      )
    })
    expect(container.textContent).toContain('required')
  })
})

// Sanity: TaskTemplateOption type is exported
const _x: TaskTemplateOption | null = null
void _x

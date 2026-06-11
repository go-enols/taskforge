/**
 * @file AirdropFormModal 组件测试
 * @description 测试 AirdropFormModal 组件：服务端渲染（创建/编辑模式标题、七个 section、加载状态和关闭状态）
 *              以及交互行为（提交表单和取消按钮回调）。
 * @module tests/renderer/airdrops
 */

import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import AirdropFormModal from '../../../src/renderer/src/components/airdrops/AirdropFormModal'
import type { TaskTemplate } from '../../../../src/shared/types'

// 模拟 react-i18next，返回 key 作为翻译结果
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))

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
  }
]
/** 模拟账号池列表 */
const pools = ['main']

// describe: 服务端渲染测试 — 验证 AirdropFormModal 的渲染输出
describe('AirdropFormModal (server render)', () => {
  // 用例：创建模式下显示"创建空投"标题
  it('renders title for create mode', () => {
    const html = renderToString(
      <AirdropFormModal
        open={true}
        mode="create"
        onClose={() => {}}
        onSubmit={() => {}}
        formData={null}
        onChange={() => {}}
        scriptTemplates={templates}
        accountPools={pools}
        loadingFormData={false}
      />
    )
    expect(html).toContain('createAirdrop')
  })

  // 用例：编辑模式下显示"编辑空投"标题
  it('renders title for edit mode', () => {
    const html = renderToString(
      <AirdropFormModal
        open={true}
        mode="edit"
        onClose={() => {}}
        onSubmit={() => {}}
        formData={null}
        onChange={() => {}}
        scriptTemplates={templates}
        accountPools={pools}
        loadingFormData={false}
      />
    )
    expect(html).toContain('editAirdrop')
  })

  // 用例：渲染全部 7 个表单区块
  it('renders all 7 sections', () => {
    const html = renderToString(
      <AirdropFormModal
        open={true}
        mode="create"
        onClose={() => {}}
        onSubmit={() => {}}
        formData={null}
        onChange={() => {}}
        scriptTemplates={templates}
        accountPools={pools}
        loadingFormData={false}
      />
    )
    expect(html).toContain('sectionBasic')
    expect(html).toContain('sectionClassification')
    expect(html).toContain('sectionLinks')
    expect(html).toContain('sectionEligibility')
    expect(html).toContain('sectionTasks')
    expect(html).toContain('sectionEarnings')
    expect(html).toContain('sectionTags')
  })

  // 用例：弹窗关闭时（open=false）不渲染任何内容
  it('renders nothing when closed (open=false)', () => {
    const html = renderToString(
      <AirdropFormModal
        open={false}
        mode="create"
        onClose={() => {}}
        onSubmit={() => {}}
        formData={null}
        onChange={() => {}}
        scriptTemplates={templates}
        accountPools={pools}
        loadingFormData={false}
      />
    )
    expect(html).not.toContain('createAirdrop')
  })

  // 用例：loadingFormData 为 true 时显示加载状态
  it('shows loading state when loadingFormData', () => {
    const html = renderToString(
      <AirdropFormModal
        open={true}
        mode="edit"
        onClose={() => {}}
        onSubmit={() => {}}
        formData={null}
        onChange={() => {}}
        scriptTemplates={[]}
        accountPools={[]}
        loadingFormData={true}
      />
    )
    expect(html).toMatch(/loading/i)
  })
})

// describe: 交互测试 — 验证 AirdropFormModal 的事件回调
describe('AirdropFormModal (interactive)', () => {
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

  // 用例：创建模式下点击提交按钮，验证 onSubmit 被调用
  it('clicking submit in create mode calls onSubmit with valid form', () => {
    const onSubmit = vi.fn()
    act(() => {
      root = createRoot(container)
      root.render(
        <AirdropFormModal
          open={true}
          mode="create"
          onClose={() => {}}
          onSubmit={onSubmit}
          formData={null}
          onChange={() => {}}
          scriptTemplates={templates}
          accountPools={pools}
          loadingFormData={false}
        />
      )
    })
    const nameInput = container.querySelector('input[name="name"]') as HTMLInputElement
    const websiteInput = container.querySelector('input[name="website"]') as HTMLInputElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(nameInput.constructor.prototype, 'value')?.set
      setter?.call(nameInput, 'TestName')
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))

      const setter2 = Object.getOwnPropertyDescriptor(websiteInput.constructor.prototype, 'value')?.set
      setter2?.call(websiteInput, 'https://test.com')
      websiteInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    // need to set accountPool too — but it has no `accountPool` input, it has select[name=accountPool]
    const poolSelect = container.querySelector('select[name="accountPool"]') as HTMLSelectElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(poolSelect.constructor.prototype, 'value')?.set
      setter?.call(poolSelect, 'main')
      poolSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const submitBtn = container.querySelector('[data-testid="airdrop-form-submit"]') as HTMLElement
    expect(submitBtn).toBeTruthy()
    act(() => {
      submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(onSubmit).toHaveBeenCalled()
  })

  // 用例：点击取消按钮触发 onClose
  it('clicking cancel button calls onClose', () => {
    const onClose = vi.fn()
    act(() => {
      root = createRoot(container)
      root.render(
        <AirdropFormModal
          open={true}
          mode="create"
          onClose={onClose}
          onSubmit={() => {}}
          formData={null}
          onChange={() => {}}
          scriptTemplates={templates}
          accountPools={pools}
          loadingFormData={false}
        />
      )
    })
    const cancelBtn = container.querySelector('[data-testid="airdrop-form-cancel"]') as HTMLElement
    act(() => {
      cancelBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(onClose).toHaveBeenCalled()
  })
})

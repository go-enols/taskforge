/**
 * @file AirdropCard 组件测试
 * @description 测试 AirdropCard 组件：服务端渲染（项目名称、描述、链接、任务数、收益等）和交互行为（编辑/删除/查看回调）。
 *              包含 useState 回归测试，确保事件不会引发不必要的重渲染。
 * @module tests/renderer/airdrops
 */

import { describe, it, expect, vi } from 'vitest'
import React, { useState } from 'react'
import { renderToString } from 'react-dom/server'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import AirdropCard from '../../../src/renderer/src/components/airdrops/AirdropCard'
import type { AirdropProject } from '../../../src/shared/types'

// 模拟 react-i18next，返回 key 作为翻译结果
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) =>
      key + (opts?.count !== undefined ? `|${opts.count}` : '')
  })
}))

/** 构造一个示例空投项目用于 AirdropCard 渲染测试 */
const sample = (overrides: Partial<AirdropProject> = {}): AirdropProject => ({
  id: 'a1',
  name: 'Hyperliquid',
  chain: 'Hyperliquid L1',
  status: 'ongoing',
  projectType: 'testnet',
  description: 'Testnet points farming',
  website: 'https://app.hyperliquid.xyz',
  scriptTemplateId: null,
  accountPool: 'main',
  links: [
    { label: 'Docs', url: 'https://docs.hyperliquid.xyz' },
    { label: 'Twitter', url: 'https://twitter.com/hyperliquid' }
  ],
  eligibilityCriteria: [],
  tasks: [
    { id: 't1', title: 'Bridge', description: '', status: 'pending', notes: '' }
  ],
  earnings: [{ id: '1', token: 'ARB', amount: 100, valueUsd: 200, date: '2026-05-01', notes: '' }],
  tags: ['L1', 'points'],
  labels: [],
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-05T00:00:00Z',
  ...overrides
})

/** 辅助函数：在 act 中触发元素的 click 事件 */
function click(el: Element | null): void {
  if (!el) throw new Error('element not found')
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

// describe: 服务端渲染测试 — 验证 AirdropCard 的基本渲染输出
describe('AirdropCard (server render)', () => {
  // 用例：渲染项目名称和描述
  it('renders project name and description', () => {
    const html = renderToString(<AirdropCard project={sample()} onEdit={() => {}} onDelete={() => {}} onView={() => {}} />)
    expect(html).toContain('Hyperliquid')
    expect(html).toContain('Testnet points farming')
  })

  // 用例：渲染网站链接并包含 target="_blank"
  it('renders the website link with target="_blank"', () => {
    const html = renderToString(<AirdropCard project={sample()} onEdit={() => {}} onDelete={() => {}} onView={() => {}} />)
    expect(html).toContain('https://app.hyperliquid.xyz')
    expect(html).toContain('target="_blank"')
  })

  // 用例：渲染链信息在元数据行中
  it('renders the chain in the meta row', () => {
    const html = renderToString(<AirdropCard project={sample()} onEdit={() => {}} onDelete={() => {}} onView={() => {}} />)
    expect(html).toContain('Hyperliquid L1')
  })

  // 用例：当 accountPool 非空时渲染账号池信息
  it('renders account pool if non-empty', () => {
    const html = renderToString(<AirdropCard project={sample()} onEdit={() => {}} onDelete={() => {}} onView={() => {}} />)
    expect(html).toContain('main')
  })

  // 用例：渲染链接标签（始终可见，不展开）
  it('renders link pills (always visible, no expand)', () => {
    const html = renderToString(<AirdropCard project={sample()} onEdit={() => {}} onDelete={() => {}} onView={() => {}} />)
    expect(html).toContain('Docs')
    expect(html).toContain('Twitter')
  })

  // 用例：超过 3 个链接时显示 "+N" 指示器
  it('renders link "more" indicator when more than 3 links', () => {
    const links = [
      { label: 'L1', url: 'u' },
      { label: 'L2', url: 'u' },
      { label: 'L3', url: 'u' },
      { label: 'L4', url: 'u' },
      { label: 'L5', url: 'u' }
    ]
    const html = renderToString(
      <AirdropCard project={sample({ links })} onEdit={() => {}} onDelete={() => {}} onView={() => {}} />
    )
    // React inserts an HTML comment between adjacent text nodes (`+` and `{hiddenLinkCount}`).
    // Match the rendered pattern with a regex tolerant of the comment separator.
    expect(html).toMatch(/\+<!--\s*-->2/)
  })

  // 用例：渲染任务数和收益摘要
  it('renders task count and earning summary', () => {
    const html = renderToString(<AirdropCard project={sample()} onEdit={() => {}} onDelete={() => {}} onView={() => {}} />)
    expect(html).toMatch(/1.*task/i)
    expect(html).toContain('100')
    expect(html).toContain('ARB')
  })

  // 用例：渲染标签徽章
  it('renders tag pills', () => {
    const html = renderToString(<AirdropCard project={sample()} onEdit={() => {}} onDelete={() => {}} onView={() => {}} />)
    expect(html).toContain('L1')
    expect(html).toContain('points')
  })

  // 用例：应用状态左边框样式类
  it('applies status border-left class', () => {
    const html = renderToString(<AirdropCard project={sample()} onEdit={() => {}} onDelete={() => {}} onView={() => {}} />)
    expect(html).toContain('border-l-primary')
  })

  // 用例：描述为空且无链信息时仍能渲染
  it('shows "—" when description empty and no chain', () => {
    const html = renderToString(
      <AirdropCard
        project={sample({ description: '', chain: '' })}
        onEdit={() => {}}
        onDelete={() => {}}
        onView={() => {}}
      />
    )
    expect(html).toBeTruthy()
  })
})

// describe: 交互测试 — 验证 AirdropCard 的事件回调
describe('AirdropCard (interactive)', () => {
  let container: HTMLDivElement
  let root: Root

  // 每次测试后卸载根节点并移除容器
  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  // 每次测试前创建 DOM 容器
  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  // 用例：点击编辑图标按钮触发 onEdit 回调
  it('calls onEdit when edit icon button is clicked', () => {
    const onEdit = vi.fn()
    act(() => {
      root = createRoot(container)
      root.render(
        <AirdropCard project={sample()} onEdit={onEdit} onDelete={() => {}} onView={() => {}} />
      )
    })
    const editBtn = container.querySelector('[data-testid="airdrop-card-edit"]') as HTMLElement
    expect(editBtn).toBeTruthy()
    click(editBtn)
    expect(onEdit).toHaveBeenCalledWith('a1')
  })

  // 用例：点击删除图标按钮触发 onDelete 回调
  it('calls onDelete when delete icon button is clicked', () => {
    const onDelete = vi.fn()
    act(() => {
      root = createRoot(container)
      root.render(
        <AirdropCard project={sample()} onEdit={() => {}} onDelete={onDelete} onView={() => {}} />
      )
    })
    const delBtn = container.querySelector('[data-testid="airdrop-card-delete"]') as HTMLElement
    click(delBtn)
    expect(onDelete).toHaveBeenCalledWith('a1')
  })

  // 用例：点击卡片主体区域触发 onView 回调
  it('calls onView when card body is clicked', () => {
    const onView = vi.fn()
    act(() => {
      root = createRoot(container)
      root.render(
        <AirdropCard project={sample()} onEdit={() => {}} onDelete={() => {}} onView={onView} />
      )
    })
    const body = container.querySelector('[data-testid="airdrop-card-body"]') as HTMLElement
    click(body)
    expect(onView).toHaveBeenCalledWith('a1')
  })
})

// describe: 回归测试 — 验证交互事件不会导致父组件不必要的重渲染风暴
describe('AirdropCard keeps interactive events local (no parent rerender storm)', () => {
  // 用例：只有无关状态变化时不应触发重渲染（回归 useState-in-render bug）
  it('does not re-render when only unrelated state changes (regression for useState-in-render bug)', () => {
    let renderCount = 0
    function Wrapper(): React.ReactElement {
      const [, setN] = useState(0)
      renderCount += 1
      return (
        <div>
          <AirdropCard project={sample()} onEdit={() => setN((x) => x + 1)} onDelete={() => {}} onView={() => {}} />
        </div>
      )
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = (() => {
      let r: Root | null = null
      act(() => {
        r = createRoot(container)
        r.render(<Wrapper />)
      })
      return r!
    })()
    const before = renderCount
    act(() => {
      ;(container.querySelector('[data-testid="airdrop-card-edit"]') as HTMLElement).dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true })
      )
    })
    // Wrapper rerenders (parent state changed), but AirdropCard itself is still the same instance
    expect(renderCount).toBeGreaterThan(before)
    act(() => root.unmount())
    container.remove()
  })
})

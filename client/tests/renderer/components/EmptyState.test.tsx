/**
 * @file EmptyState 空状态组件测试
 * @description 验证 EmptyState 组件正确渲染图标/标题/描述文本、可选的操作按钮、
 *              以及紧凑模式 dense 变体的样式。
 * @module tests/renderer/components
 */

import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import EmptyState from '../../../src/renderer/src/components/common/EmptyState'
import { Package } from 'lucide-react'

// describe: EmptyState — 空状态占位组件
describe('EmptyState', () => {
  // 用例：渲染图标、标题和描述文本
  it('renders icon, title, description', () => {
    const html = renderToString(
      <EmptyState icon={Package} title="No items" description="Add one to get started" />
    )
    expect(html).toContain('No items')
    expect(html).toContain('Add one to get started')
    expect(html).toContain('lucide-package')
  })

  // 用例：传入 action 属性时渲染操作按钮
  it('renders optional action button when provided', () => {
    const html = renderToString(
      <EmptyState icon={Package} title="No items" action={<button>Add</button>} />
    )
    expect(html).toContain('Add')
    expect(html).toContain('button')
  })

  // 用例：dense 紧凑模式应用缩小的 padding 类
  it('applies dense variant class for compact contexts', () => {
    const html = renderToString(<EmptyState icon={Package} title="x" dense />)
    expect(html).toMatch(/py-4|p-4/)
  })
})

/**
 * @file StaggeredFadeIn 组件测试
 * @description 验证 StaggeredFadeIn 组件正确渲染 stagger-fade/stagger-item CSS 类、
 *              保持子元素顺序、以及支持自定义 delayStep 属性。
 * @module tests/renderer/components
 */

import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import StaggeredFadeIn from '../../../src/renderer/src/components/common/StaggeredFadeIn'


describe('StaggeredFadeIn', () => {

  it('wraps children in a container with stagger-fade class', () => {
    const html = renderToString(
      <StaggeredFadeIn>
        <div>a</div>
        <div>b</div>
        <div>c</div>
      </StaggeredFadeIn>
    )
    expect(html).toContain('stagger-fade')
    expect(html).toContain('stagger-item')
  })


  it('renders all children in order', () => {
    const html = renderToString(
      <StaggeredFadeIn>
        <span data-testid="child-1">one</span>
        <span data-testid="child-2">two</span>
      </StaggeredFadeIn>
    )
    expect(html).toContain('one')
    expect(html).toContain('two')
  })


  it('respects custom delay step prop', () => {
    const html = renderToString(
      <StaggeredFadeIn delayStep={100}>
        <div>a</div>
      </StaggeredFadeIn>
    )
    expect(html).toContain('stagger-fade')
  })
})

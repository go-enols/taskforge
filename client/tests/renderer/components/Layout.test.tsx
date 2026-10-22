/**
 * @file Layout 导航布局组件测试
 * @description 验证 Layout 组件根据用户角色正确过滤侧边栏导航项，
 *              确保 admin/developer/user 各角色只能看到有权限的页面入口。
 * @module tests/renderer/components
 */

import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { UserRole } from '../../../src/renderer/src/contexts/AuthContext'

/** 当前模拟的角色状态，用于动态切换 useAuth 返回值 */
let mockRole: UserRole | null = 'user'
vi.mock('../../../src/renderer/src/contexts/AuthContext', async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>
  return {
    ...mod,
    useAuth: () => ({
      user: mockRole ? { id: 'u1', username: 'u1', displayName: 'u1', role: mockRole } : null,
      token: 't',
      loading: false,
      login: vi.fn(),
      register: vi.fn(),
      setup: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
      role: mockRole,
      isAdmin: mockRole === 'admin',
      isDeveloper: mockRole === 'developer' || mockRole === 'admin'
    })
  }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k })
}))

// Layout 内的 ThemeToggle 依赖 useTheme；测试中提供最小 ThemeContext 桩
vi.mock('../../../src/renderer/src/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'dark', pref: 'auto', setPref: vi.fn() })
}))

/** Layout 默认导出组件（动态 import） */
const Layout = (await import('../../../src/renderer/src/components/Layout')).default

/**
 * 辅助函数：以指定角色渲染 Layout 并返回 HTML 字符串
 *
 * @param role - 要模拟的用户角色
 * @returns 渲染后的 HTML
 */
function renderAs(role: UserRole | null): string {
  mockRole = role
  return renderToString(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="*" element={<Layout>{<div>page</div>}</Layout>} />
      </Routes>
    </MemoryRouter>
  )
}

// describe: Layout — 按角色过滤导航项可见性
describe('Layout — nav visibility by role', () => {
  // 用例：admin 角色侧边栏包含 /debug 入口
  it('admin sees /debug in the sidebar', () => {
    expect(renderAs('admin')).toContain('nav.debug')
  })

  // 用例：developer 角色侧边栏包含 /debug 入口（本地脚本调试）
  it('developer sees /debug in the sidebar (its primary use case: local script debugging)', () => {
    expect(renderAs('developer')).toContain('nav.debug')
  })

  // 用例：user 角色侧边栏不包含 /debug 入口
  it('user does NOT see /debug in the sidebar', () => {
    expect(renderAs('user')).not.toContain('nav.debug')
  })

  // 用例：admin 角色可见所有 admin 专属导航项（验证明细角色过滤配置正确）
  // 注意：admin 中心与 data 是折叠分组，未展开时只渲染父级 key，子项按需展开渲染。
  it('admin sees all admin nav items (sanity check that the role filter is wired correctly)', () => {
    const html = renderAs('admin')
    expect(html).toContain('nav.dashboard')
    expect(html).toContain('nav.marketplace')
    expect(html).toContain('nav.settings')
    expect(html).toContain('nav.adminCenter')
    expect(html).toContain('nav.logs')
    expect(html).toContain('nav.stats')
  })

  // 用例：developer 角色可见开发者专属项，但不可见 admin 专属项
  it('developer sees developer-only nav items but NOT admin-only ones', () => {
    const html = renderAs('developer')
    expect(html).toContain('nav.developerCenter')
    expect(html).toContain('nav.debug')
    expect(html).not.toContain('nav.adminCenter')
    expect(html).not.toContain('nav.logs')
    expect(html).not.toContain('nav.stats')
  })

  // 用例：user 角色可见运营导航项，但不可见 admin/developer 专属项
  it('user sees operational nav but NOT admin or developer-only items', () => {
    const html = renderAs('user')
    expect(html).toContain('nav.data')
    expect(html).toContain('nav.tasks')
    expect(html).toContain('nav.scheduler')
    expect(html).toContain('nav.airdrops')
    expect(html).not.toContain('nav.debug')
    expect(html).not.toContain('nav.developerCenter')
    expect(html).not.toContain('nav.adminCenter')
  })
})


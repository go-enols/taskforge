import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { UserRole } from '../../../src/renderer/src/contexts/AuthContext'

// Mock the useAuth hook so we can inject a user with a chosen role.
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

// Import after mocks
const Layout = (await import('../../../src/renderer/src/components/Layout')).default

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

describe('Layout — nav visibility by role', () => {
  it('admin sees /debug in the sidebar', () => {
    expect(renderAs('admin')).toContain('nav.debug')
  })

  it('developer sees /debug in the sidebar (its primary use case: local script debugging)', () => {
    expect(renderAs('developer')).toContain('nav.debug')
  })

  it('user does NOT see /debug in the sidebar', () => {
    expect(renderAs('user')).not.toContain('nav.debug')
  })

  it('admin sees all other admin-only nav items (sanity check that the role filter is wired correctly)', () => {
    const html = renderAs('admin')
    expect(html).toContain('nav.dashboard')
    expect(html).toContain('nav.templates')
    expect(html).toContain('nav.settings')
    expect(html).toContain('nav.adminReview')
    expect(html).toContain('nav.users')
    expect(html).toContain('nav.logs')
  })

  it('developer sees developer-only nav items but NOT admin-only ones', () => {
    const html = renderAs('developer')
    expect(html).toContain('nav.quickDev')
    expect(html).toContain('nav.developerPending')
    expect(html).toContain('nav.debug')
    expect(html).not.toContain('nav.adminReview')
    expect(html).not.toContain('nav.users')
    expect(html).not.toContain('nav.logs')
  })

  it('user sees operational nav but NOT admin or developer-only items', () => {
    const html = renderAs('user')
    expect(html).toContain('nav.wallets')
    expect(html).toContain('nav.accounts')
    expect(html).toContain('nav.tasks')
    expect(html).toContain('nav.scheduler')
    expect(html).not.toContain('nav.debug')
    expect(html).not.toContain('nav.quickDev')
    expect(html).not.toContain('nav.adminReview')
  })
})

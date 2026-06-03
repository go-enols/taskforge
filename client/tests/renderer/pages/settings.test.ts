import { describe, it, expect } from 'vitest'
import {
  SECTIONS,
  getVisibleSections,
  type UserRole,
  type SectionId
} from '../../../src/renderer/src/pages/settings-sections'

describe('Settings sections — role visibility (terminal model)', () => {
  it('SECTIONS exposes the 10 known section ids (updates is now its own section)', () => {
    const ids = SECTIONS.map((s) => s.id).sort()
    expect(ids).toEqual(
      [
        'about',
        'advanced',
        'appearance',
        'data',
        'marketplace',
        'profile',
        'security',
        'system',
        'taskDefaults',
        'updates'
      ].sort()
    )
  })

  it('every section declares both a labelKey and a descriptionKey (i18n-ready)', () => {
    for (const s of SECTIONS) {
      expect(s.labelKey, `${s.id}.labelKey`).toMatch(/^settings\./)
      expect(s.descriptionKey, `${s.id}.descriptionKey`).toMatch(/^settings\./)
    }
  })

  it('every section declares a scope (personal | computer)', () => {
    const scopes = new Set(SECTIONS.map((s) => s.scope))
    expect(scopes.has('personal')).toBe(true)
    expect(scopes.has('computer')).toBe(true)
    for (const s of SECTIONS) {
      expect(['personal', 'computer']).toContain(s.scope)
    }
  })

  it('admin sees ALL 10 sections (including taskDefaults + updates)', () => {
    const visible = getVisibleSections('admin')
    const ids = visible.map((s) => s.id)
    expect(ids).toContain('taskDefaults') // the fix: previously excluded admin
    expect(ids).toContain('updates') // the fix: previously hidden inside admin-only System
    expect(ids).toContain('marketplace')
    expect(ids).toContain('security')
    expect(ids).toContain('system')
    expect(ids).toContain('advanced')
  })

  it('developer sees 6 sections (no admin-only server config)', () => {
    const visible = getVisibleSections('developer')
    const ids = visible.map((s) => s.id)
    expect(ids).toContain('taskDefaults')
    expect(ids).toContain('updates') // NEW: updates is now its own section visible to all roles
    expect(ids).not.toContain('marketplace')
    expect(ids).not.toContain('security')
    expect(ids).not.toContain('system')
    expect(ids).not.toContain('advanced')
  })

  it('user sees 6 sections (personal + task defaults + updates)', () => {
    const visible = getVisibleSections('user')
    const ids = visible.map((s) => s.id)
    expect(ids).toContain('profile')
    expect(ids).toContain('appearance')
    expect(ids).toContain('taskDefaults')
    expect(ids).toContain('data')
    expect(ids).toContain('about')
    expect(ids).toContain('updates') // NEW: updates is now its own section visible to all roles
    expect(ids).not.toContain('marketplace')
    expect(ids).not.toContain('security')
    expect(ids).not.toContain('system')
    expect(ids).not.toContain('advanced')
  })

  it('developer sees 6 sections (no admin-only server config)', () => {
    const visible = getVisibleSections('developer')
    const ids = visible.map((s) => s.id)
    expect(ids).toContain('taskDefaults')
    expect(ids).not.toContain('marketplace')
    expect(ids).not.toContain('security')
    expect(ids).not.toContain('system')
    expect(ids).not.toContain('advanced')
  })

  it('user sees 5 sections (personal + task defaults, no admin tooling)', () => {
    const visible = getVisibleSections('user')
    const ids = visible.map((s) => s.id)
    expect(ids).toContain('profile')
    expect(ids).toContain('appearance')
    expect(ids).toContain('taskDefaults')
    expect(ids).toContain('data')
    expect(ids).toContain('about')
    expect(ids).not.toContain('marketplace')
    expect(ids).not.toContain('security')
    expect(ids).not.toContain('system')
    expect(ids).not.toContain('advanced')
  })

  it('personal sections come BEFORE computer sections in render order', () => {
    const visible = getVisibleSections('admin')
    const lastPersonalIdx = visible
      .map((s, i) => (s.scope === 'personal' ? i : -1))
      .filter((i) => i >= 0)
      .pop()!
    const firstComputerIdx = visible.findIndex((s) => s.scope === 'computer')
    expect(firstComputerIdx).toBeGreaterThan(lastPersonalIdx)
  })

  it('profile is the default landing section for any role', () => {
    for (const role of ['admin', 'developer', 'user'] as UserRole[]) {
      const visible = getVisibleSections(role)
      expect(visible[0]?.id).toBe('profile')
    }
  })
})

describe('Settings sections — per-role exact sections', () => {
  // Exact-section assertions serve as a regression guard. If you intentionally
  // add or remove a section for a role, update the expected list here.
  const expected: Record<UserRole, SectionId[]> = {
    admin: [
      'profile',
      'appearance',
      'data',
      'about',
      'taskDefaults',
      'updates',
      'marketplace',
      'security',
      'system',
      'advanced'
    ],
    developer: ['profile', 'appearance', 'data', 'about', 'taskDefaults', 'updates'],
    user: ['profile', 'appearance', 'data', 'about', 'taskDefaults', 'updates']
  }

  for (const role of ['admin', 'developer', 'user'] as UserRole[]) {
    it(`role=${role} sees the exact section list`, () => {
      const visible = getVisibleSections(role).map((s) => s.id)
      expect(visible).toEqual(expected[role])
    })
  }
})

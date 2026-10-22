/**
 * @file 空投默认值辅助函数测试
 * @description 验证 airdrop-defaults 工具函数的正确性，
 *              包括空表单结构、FormData 双向转换、基础验证、
 *              以及空行工厂函数等功能。
 * @module tests/renderer/airdrops
 */

import { describe, it, expect } from 'vitest'
import {
  emptyForm,
  toFormData,
  fromFormData,
  validateBasic,
  makeEmptyLink,
  makeEmptyTask,
  makeEmptyEarning,
  makeEmptyEligibility
} from '../../../src/renderer/src/components/airdrops/airdrop-defaults'
import type { AirdropProject, AirdropTaskStatus } from '../../../src/shared/types'

const sampleAirdrop = (overrides: Partial<AirdropProject> = {}): AirdropProject => ({
  id: 'a1',
  name: 'Hyperliquid',
  chain: 'Hyperliquid L1',
  status: 'ongoing',
  projectType: 'testnet',
  description: 'Testnet points farming',
  website: 'https://app.hyperliquid.xyz',
  scriptTemplateId: 'script-uuid-1',
  accountPool: 'main-pool',
  links: [
    { label: 'Docs', url: 'https://docs.hyperliquid.xyz' },
    { label: '', url: 'https://twitter.com/hyperliquid' }
  ],
  eligibilityCriteria: [
    {
      id: 'e1',
      description: 'Min 10 transactions',
      requirementType: 'txCount',
      requirementValue: '10',
      required: true,
      met: false,
      notes: 'tracked weekly'
    }
  ],
  tasks: [
    {
      id: 't1',
      title: 'Bridge to Hyperliquid',
      description: 'Use Orbiter or Rhino',
      deadline: '2026-07-01',
      status: 'pending',
      notes: 'low fee window'
    }
  ],
  earnings: [
    { id: 'ear1', token: 'ARB', amount: 100, valueUsd: 200, date: '2026-05-01', notes: 'season 1' }
  ],
  tags: ['L1', 'points', 'airdrop'],
  labels: ['priority'],
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-05T00:00:00Z',
  ...overrides
})

describe('emptyForm', () => {
  it('produces a valid empty form structure', () => {
    const f = emptyForm()
    expect(f.name).toBe('')
    expect(f.website).toBe('')
    expect(f.scriptTemplateId).toBe('')
    expect(f.accountPool).toBe('')
    expect(f.status).toBe('ongoing')
    expect(f.projectType).toBe('testnet')
    expect(f.description).toBe('')
    expect(f.tags).toBe('')
    expect(f.labels).toBe('')
    expect(f.links).toEqual([])
    expect(f.eligibilityCriteria).toEqual([])
    expect(f.tasks).toEqual([])
    expect(f.earnings).toEqual([])
  })
})

describe('toFormData', () => {
  it('converts AirdropProject to FormData with string splits', () => {
    const fd = toFormData(sampleAirdrop())
    expect(fd.name).toBe('Hyperliquid')
    expect(fd.website).toBe('https://app.hyperliquid.xyz')
    expect(fd.scriptTemplateId).toBe('script-uuid-1')
    expect(fd.accountPool).toBe('main-pool')
    expect(fd.tags).toBe('L1, points, airdrop')
    expect(fd.labels).toBe('priority')
    expect(fd.links).toHaveLength(2)
    expect(fd.links[0]).toEqual({ label: 'Docs', url: 'https://docs.hyperliquid.xyz' })
    expect(fd.tasks).toHaveLength(1)
    expect(fd.tasks[0].title).toBe('Bridge to Hyperliquid')
    expect(fd.earnings).toHaveLength(1)
    expect(fd.earnings[0].token).toBe('ARB')
    expect(fd.eligibilityCriteria).toHaveLength(1)
  })

  it('handles empty tags/labels gracefully', () => {
    const fd = toFormData(sampleAirdrop({ tags: [], labels: [] }))
    expect(fd.tags).toBe('')
    expect(fd.labels).toBe('')
  })

  it('handles empty optional scriptTemplateId', () => {
    const fd = toFormData(sampleAirdrop({ scriptTemplateId: undefined }))
    expect(fd.scriptTemplateId).toBe('')
  })
})

describe('fromFormData', () => {
  it('converts FormData back to a valid AirdropProject payload (omitting id/createdAt/updatedAt)', () => {
    const fd = toFormData(sampleAirdrop())
    const payload = fromFormData(fd)
    expect(payload.name).toBe('Hyperliquid')
    expect(payload.website).toBe('https://app.hyperliquid.xyz')
    expect(payload.scriptTemplateId).toBe('script-uuid-1')
    expect(payload.accountPool).toBe('main-pool')
    expect(payload.status).toBe('ongoing')
    expect(payload.projectType).toBe('testnet')
    expect(payload.tags).toEqual(['L1', 'points', 'airdrop'])
    expect(payload.labels).toEqual(['priority'])
    expect(payload.links).toEqual(sampleAirdrop().links)
    expect(payload.tasks).toEqual(sampleAirdrop().tasks)
    expect(payload.earnings).toEqual(sampleAirdrop().earnings)
    expect(payload.eligibilityCriteria).toEqual(sampleAirdrop().eligibilityCriteria)
    // chain 已废弃：fromFormData 始终写空字符串以兼容旧数据
    expect(payload.chain).toBe('')
    expect(payload).not.toHaveProperty('id')
    expect(payload).not.toHaveProperty('createdAt')
    expect(payload).not.toHaveProperty('updatedAt')
  })

  it('trims whitespace from string fields', () => {
    const fd = { ...toFormData(sampleAirdrop()), name: '  Trimmed Name  ', website: '  https://x.com  ' }
    const payload = fromFormData(fd)
    expect(payload.name).toBe('Trimmed Name')
    expect(payload.website).toBe('https://x.com')
  })

  it('splits tags/labels by comma, trims, filters empty', () => {
    const fd = { ...toFormData(sampleAirdrop()), tags: 'a, b ,c, , d', labels: ' x , y ' }
    const payload = fromFormData(fd)
    expect(payload.tags).toEqual(['a', 'b', 'c', 'd'])
    expect(payload.labels).toEqual(['x', 'y'])
  })

  it('sets scriptTemplateId to undefined when empty string', () => {
    const fd = { ...toFormData(sampleAirdrop()), scriptTemplateId: '' }
    const payload = fromFormData(fd)
    expect(payload.scriptTemplateId).toBeUndefined()
  })

  it('round-trip preserves data', () => {
    const original = sampleAirdrop()
    const payload = fromFormData(toFormData(original))
    expect(payload.name).toBe(original.name)
    expect(payload.website).toBe(original.website)
    expect(payload.accountPool).toBe(original.accountPool)
    expect(payload.status).toBe(original.status)
    expect(payload.projectType).toBe(original.projectType)
    expect(payload.tags).toEqual(original.tags)
    expect(payload.labels).toEqual(original.labels)
    expect(payload.links).toEqual(original.links)
    expect(payload.tasks).toEqual(original.tasks)
    expect(payload.earnings).toEqual(original.earnings)
    expect(payload.eligibilityCriteria).toEqual(original.eligibilityCriteria)
  })
})

describe('validateBasic', () => {
  it('passes for fully filled form', () => {
    const fd = toFormData(sampleAirdrop())
    expect(validateBasic(fd)).toEqual({ valid: true })
  })

  it('fails when name is empty', () => {
    const fd = { ...toFormData(sampleAirdrop()), name: '  ' }
    expect(validateBasic(fd)).toEqual({ valid: false, field: 'name' })
  })

  it('fails when website is empty', () => {
    const fd = { ...toFormData(sampleAirdrop()), website: '' }
    expect(validateBasic(fd)).toEqual({ valid: false, field: 'website' })
  })

  it('fails when accountPool is empty', () => {
    const fd = { ...toFormData(sampleAirdrop()), accountPool: '' }
    expect(validateBasic(fd)).toEqual({ valid: false, field: 'accountPool' })
  })
})

describe('factory helpers', () => {
  it('makeEmptyLink produces a blank link row', () => {
    expect(makeEmptyLink()).toEqual({ label: '', url: '' })
  })

  it('makeEmptyTask produces a blank task row with valid status', () => {
    const t = makeEmptyTask()
    expect(t.title).toBe('')
    expect(t.description).toBe('')
    expect(t.notes).toBe('')
    expect(['pending', 'inProgress', 'completed', 'skipped']).toContain(t.status as AirdropTaskStatus)
    expect(t.id).toBeTruthy()
  })

  it('makeEmptyEarning produces a blank earning row', () => {
    const e = makeEmptyEarning()
    expect(e.token).toBe('')
    expect(e.amount).toBe(0)
    expect(e.valueUsd).toBe(0)
    expect(e.date).toBeTruthy()
    expect(e.notes).toBe('')
    expect(e.id).toBeTruthy()
  })

  it('makeEmptyEligibility produces a blank eligibility row', () => {
    const el = makeEmptyEligibility()
    expect(el.description).toBe('')
    expect(el.requirementType).toBe('')
    expect(el.requirementValue).toBe('')
    expect(el.required).toBe(false)
    expect(el.met).toBe(false)
    expect(el.notes).toBe('')
    expect(el.id).toBeTruthy()
  })
})

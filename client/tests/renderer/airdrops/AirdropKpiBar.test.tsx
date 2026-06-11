/**
 * @file AirdropKpiBar 组件测试
 * @description 测试 AirdropKpiBar 组件：验证四个 KPI 板块的渲染、数值格式化、空值处理和代币显示。
 * @module tests/renderer/airdrops
 */

import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import AirdropKpiBar from '../../../src/renderer/src/components/airdrops/AirdropKpiBar'
import type { AirdropAnalytics } from '../../../src/shared/types'

// 模拟 react-i18next，返回 key 作为翻译结果
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

/** 构造示例分析数据用于 KPI 栏测试 */
const sample = (overrides: Partial<AirdropAnalytics> = {}): AirdropAnalytics => ({
  totalAirdrops: 12,
  ongoingCount: 5,
  completedCount: 3,
  claimedCount: 2,
  totalEarningsValueUsd: 1234.56,
  tokenEarnings: [
    { token: 'ARB', totalAmount: 200, totalValueUsd: 400 },
    { token: 'OP', totalAmount: 50, totalValueUsd: 150 }
  ],
  upcomingDeadlines: [],
  ...overrides
})

// describe: 验证 AirdropKpiBar 各组件的渲染和行为
describe('AirdropKpiBar', () => {
  // 用例：渲染全部 4 个 KPI 板块
  it('renders all 4 tiles', () => {
    const html = renderToString(<AirdropKpiBar analytics={sample()} />)
    expect(html).toContain('airdrops.kpi.total')
    expect(html).toContain('airdrops.kpi.ongoing')
    expect(html).toContain('airdrops.kpi.claimed')
    expect(html).toContain('airdrops.kpi.earnings')
  })

  // 用例：显示计数和格式化的美元金额
  it('shows counts and formatted USD', () => {
    const html = renderToString(<AirdropKpiBar analytics={sample()} />)
    expect(html).toContain('12')
    expect(html).toContain('5')
    expect(html).toContain('2')
    // USD formatted — exact string depends on locale, but contains digits and $
    expect(html).toMatch(/1,?234\.56|\$1,234\.56|\$1234\.56/)
  })

  // 用例：分析数据为空时渲染 0 / $0
  it('renders 0 / $0 when analytics is empty', () => {
    const html = renderToString(
      <AirdropKpiBar
        analytics={{
          totalAirdrops: 0,
          ongoingCount: 0,
          completedCount: 0,
          claimedCount: 0,
          totalEarningsValueUsd: 0,
          tokenEarnings: [],
          upcomingDeadlines: []
        }}
      />
    )
    expect(html).toBeTruthy()
    expect(html).toMatch(/0\b/)
  })

  // 用例：在收益板块中显示主要代币
  it('renders top tokens in the earnings tile', () => {
    const html = renderToString(<AirdropKpiBar analytics={sample()} />)
    expect(html).toContain('ARB')
    expect(html).toContain('OP')
  })
})

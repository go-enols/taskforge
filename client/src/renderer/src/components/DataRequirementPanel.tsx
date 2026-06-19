/**
 * @file DataRequirementPanel — 数据需求选择面板
 * @description 根据 manifest.dataRequirements 动态渲染每个数据需求的折叠式选择面板。
 *              支持 wallet/proxy/script_param 三种数据源。数据需在对应管理页面提前创建好。
 * @module renderer/components
 */
import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { DataRequirement, Wallet, Proxy, ScriptParam } from '../types'

// ============================================================
// 类型定义
// ============================================================

export interface RequirementSelection {
  key: string
  selectedIds: Set<string>
  poolFilter: string
}

export interface DataForRequirement {
  requirementKey: string
  wallets?: Wallet[]
  proxies?: Proxy[]
  scriptParams?: ScriptParam[]
}

// ============================================================
// 工具函数
// ============================================================

interface DataRow {
  id: string
  label: string
  sublabel: string
  tags?: string[]
}

function extractRows(data: DataForRequirement, source: DataRequirement['source']): DataRow[] {
  const rows: DataRow[] = []

  if (source === 'wallet' && data.wallets) {
    for (const w of data.wallets) {
      rows.push({
        id: w.id,
        label: `${w.address.slice(0, 6)}...${w.address.slice(-4)}`,
        sublabel: w.walletType.toUpperCase(),
        tags: w.labels
      })
    }
  }

  if (source === 'proxy' && data.proxies) {
    for (const p of data.proxies) {
      rows.push({
        id: p.id,
        label: `${p.protocol}://${p.host}:${p.port}`,
        sublabel: p.status === 'active' ? '\u25CF 在线' : '\u25CB 离线',
        tags: p.labels
      })
    }
  }

  if (source === 'script_param' && data.scriptParams) {
    for (const a of data.scriptParams) {
      rows.push({
        id: a.id,
        label: a.pool || a.id.slice(0, 8),
        sublabel: a.pool || '',
        tags: a.labels
      })
    }
  }

  return rows
}

// ============================================================
// 子组件：单个需求块
// ============================================================

interface RequireBlockProps {
  req: DataRequirement
  sel: RequirementSelection | undefined
  data: DataForRequirement | undefined
  isCollapsed: boolean
  pools: string[]
  onToggleCollapse: () => void
  onToggleItem: (itemId: string) => void
  onToggleAll: () => void
  onPoolFilterChange: (pool: string) => void
}

const RequireBlock: React.FC<RequireBlockProps> = ({
  req,
  sel,
  data,
  isCollapsed,
  pools,
  onToggleCollapse,
  onToggleItem,
  onToggleAll,
  onPoolFilterChange
}) => {
  const { t } = useTranslation()
  const rows = data ? extractRows(data, req.source) : []
  const selectedCount = sel?.selectedIds.size ?? 0
  const poolFilter = sel?.poolFilter ?? ''

  const filteredRows =
    req.source === 'script_param' && poolFilter
      ? rows.filter((r) => r.sublabel === poolFilter)
      : rows

  const allFilteredSelected =
    filteredRows.length > 0 && filteredRows.every((r) => sel?.selectedIds.has(r.id))

  return (
    <div className="border border-border-light rounded-lg overflow-hidden">
      {/* 标题栏 */}
      <button
        type="button"
        onClick={onToggleCollapse}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-bg-tertiary transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {isCollapsed ? (
            <ChevronRight size={14} className="text-text-muted flex-shrink-0" />
          ) : (
            <ChevronDown size={14} className="text-text-muted flex-shrink-0" />
          )}
          <span className="text-sm font-medium text-text-secondary truncate">{req.label}</span>
          <span className="text-xs text-text-muted hidden sm:inline">
            ({req.min}-{req.max === -1 ? '\u221E' : req.max})
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {selectedCount > 0 ? (
            <span className="px-1.5 py-0.5 rounded bg-primary-light text-primary text-xs font-medium">
              {selectedCount}/{rows.length}
            </span>
          ) : (
            <span className="text-xs text-text-muted">{t('dataRequirement.noneSelected')}</span>
          )}
        </div>
      </button>

      {/* 展开内容 */}
      {!isCollapsed && (
        <div className="border-t border-border-light px-3 py-2 space-y-2">
          {req.description && <p className="text-xs text-text-muted">{req.description}</p>}

          {/* 工具栏 */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={onToggleAll}
                className="rounded"
                disabled={filteredRows.length === 0}
              />
              {t('dataRequirement.selectAll')}
            </label>

            {req.source === 'script_param' && pools.length > 1 && (
              <select
                value={poolFilter}
                onChange={(e) => onPoolFilterChange(e.target.value)}
                className="px-2 py-1 text-xs rounded border border-border-light bg-bg-card focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">{t('dataRequirement.allPools')}</option>
                {pools.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            )}
          </div>

          {/* 校验提示 */}
          {selectedCount < req.min && (
            <p className="text-xs text-warning">
              {t('dataRequirement.minHint', { count: req.min })}
            </p>
          )}
          {req.max > 0 && selectedCount > req.max && (
            <p className="text-xs text-warning">
              {t('dataRequirement.maxHint', { count: req.max })}
            </p>
          )}

          {/* 数据列表 */}
          {filteredRows.length === 0 ? (
            <p className="text-xs text-text-muted py-2 text-center">
              {t('dataRequirement.noneAvailable')}
            </p>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {filteredRows.map((row) => (
                <label
                  key={row.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-bg-tertiary cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={sel?.selectedIds.has(row.id) ?? false}
                    onChange={() => onToggleItem(row.id)}
                    className="rounded flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-text-primary block truncate">{row.label}</span>
                    <span className="text-xs text-text-muted">{row.sublabel}</span>
                  </div>
                  {row.tags && row.tags.length > 0 && (
                    <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
                      {row.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted text-xs">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================
// 主组件
// ============================================================

interface DataRequirementPanelProps {
  requirements: DataRequirement[]
  dataMap: Map<string, DataForRequirement>
  selections: Map<string, RequirementSelection>
  onToggleItem: (reqKey: string, itemId: string) => void
  onToggleAll: (reqKey: string) => void
  onPoolFilterChange: (reqKey: string, pool: string) => void
}

const DataRequirementPanel: React.FC<DataRequirementPanelProps> = ({
  requirements,
  dataMap,
  selections,
  onToggleItem,
  onToggleAll,
  onPoolFilterChange
}) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const poolsByKey = useMemo(() => {
    const result = new Map<string, string[]>()
    for (const req of requirements) {
      if (req.source !== 'script_param') continue
      const d = dataMap.get(req.key)
      if (!d?.scriptParams) continue
      const pools = [...new Set(d.scriptParams.map((a) => a.pool).filter(Boolean))]
      result.set(req.key, pools)
    }
    return result
  }, [requirements, dataMap])

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (!requirements || requirements.length === 0) return null


  return (
    <div className="space-y-2">
      {requirements.map((req) => (
        <RequireBlock
          key={req.key}
          req={req}
          sel={selections.get(req.key)}
          data={dataMap.get(req.key)}
          isCollapsed={collapsed.has(req.key)}
          pools={poolsByKey.get(req.key) ?? []}
          onToggleCollapse={() => toggleCollapse(req.key)}
          onToggleItem={(itemId) => onToggleItem(req.key, itemId)}
          onToggleAll={() => onToggleAll(req.key)}
          onPoolFilterChange={(pool) => onPoolFilterChange(req.key, pool)}
        />
      ))}
    </div>
  )
}

export default DataRequirementPanel

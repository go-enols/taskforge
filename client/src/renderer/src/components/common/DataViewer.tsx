/**
 * @file DataViewer — 结构化数据快照可视化组件
 * @description 根据 DataSnapshot 的数据形状自动选择最佳视图（Table / KV / JSON Tree / Card），
 * 用户也可手动切换视图模式。
 */

import React, { useState, useMemo } from 'react'
import type { DataSnapshot } from '../../../../shared/types'
import { isTableable, isKeyValue, isCardable } from '../../../../shared/utils/type-guards'

type DataView = 'table' | 'kv' | 'json' | 'card'

function resolveView(view: string, data: unknown): DataView {
  if (view !== 'auto' && ['table', 'kv', 'json', 'card'].includes(view)) {
    return view as DataView
  }
  // auto: 按数据形状选择
  if (isCardable(data)) return 'card'
  if (isTableable(data)) return 'table'
  if (isKeyValue(data)) return 'kv'
  return 'json'
}

/** 对象数组 → 可排序表格 */
function DataTable({ rows }: { rows: Record<string, unknown>[] }) {
  const columns = useMemo(() => {
    const keys = new Set<string>()
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        keys.add(key)
      }
    }
    return Array.from(keys)
  }, [rows])

  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortAsc, setSortAsc] = useState(true)

  const sorted = useMemo(() => {
    if (!sortCol) return rows
    return [...rows].sort((a, b) => {
      const va = a[sortCol], vb = b[sortCol]
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === 'number' && typeof vb === 'number') return sortAsc ? va - vb : vb - va
      return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va))
    })
  }, [rows, sortCol, sortAsc])

  const toggleSort = (col: string) => {
    if (sortCol === col) {
      setSortAsc((v) => !v)
    } else {
      setSortCol(col)
      setSortAsc(true)
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px] font-mono border-collapse">
        <thead>
          <tr className="border-b border-border-light">
            {columns.map((col) => (
              <th
                key={col}
                onClick={() => toggleSort(col)}
                className="text-left px-2 py-1 text-text-muted font-medium cursor-pointer hover:text-text-secondary transition-colors"
              >
                {col}
                {sortCol === col && (
                  <span className="ml-1">{sortAsc ? '\u2191' : '\u2193'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, ri) => (
            <tr key={ri} className="border-b border-border-light/30 hover:bg-bg-tertiary/30">
              {columns.map((col) => (
                <td key={col} className="px-2 py-1 text-text-secondary whitespace-nowrap">
                  {renderCellValue(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function renderCellValue(v: unknown): string {
  if (v === null || v === undefined) return '\u2014'
  if (typeof v === 'boolean') return v ? '\u2713' : '\u2717'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** 扁平对象 → key-value 列表 */
function DataKV({ obj }: { obj: Record<string, unknown> }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs font-mono">
      {Object.entries(obj).map(([k, v]) => (
        <React.Fragment key={k}>
          <span className="text-text-muted text-right">{k}</span>
          <span className="text-text-secondary">{renderCellValue(v)}</span>
        </React.Fragment>
      ))}
    </div>
  )
}

/** 任意值 → 可折叠 JSON 树 */
function DataTree({ data }: { data: unknown }) {
  return (
    <div className="font-mono text-xs">
      <TreeNode value={data} depth={0} />
    </div>
  )
}

function TreeNode({ value, depth }: { value: unknown; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2)
  const indent = depth * 16

  if (value === null || value === undefined) {
    return <span style={{ marginLeft: indent }} className="text-text-muted italic">null</span>
  }
  if (typeof value !== 'object') {
    return <span style={{ marginLeft: indent }} className="text-text-secondary">{String(value)}</span>
  }

  const isArray = Array.isArray(value)
  const entries = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v] as [string, unknown])
    : Object.entries(value as Record<string, unknown>)
  const isEmpty = entries.length === 0

  if (isEmpty) {
    return <span style={{ marginLeft: indent }} className="text-text-muted">{isArray ? '[]' : '{}'}</span>
  }

  const bracket = isArray ? `[${expanded ? '' : `...${entries.length} items`}]` : `{${expanded ? '' : `...${entries.length} keys`}}`

  return (
    <div style={{ marginLeft: indent }}>
      <button onClick={() => setExpanded((v) => !v)} className="text-text-muted hover:text-text-secondary mr-1">
        {expanded ? '\u25BC' : '\u25B6'} <span className="text-text-muted">{bracket}</span>
      </button>
      {expanded && (
        <div className="border-l border-border-light ml-2 pl-2">
          {entries.map(([k, v]) => (
            <div key={k} className="flex">
              <span className="text-primary mr-1 shrink-0">{k}:</span>
              <TreeNode value={v} depth={depth + 1} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** 小对象数组 → 卡片网格 */
function DataCards({ items }: { items: Record<string, unknown>[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item, i) => (
        <div key={i} className="border border-border-light rounded p-2 bg-bg-card">
          <DataKV obj={item} />
        </div>
      ))}
    </div>
  )
}

interface DataViewerProps {
  snap: DataSnapshot
  /** 可选：覆盖默认视图 */
  defaultView?: DataView
}

/**
 * DataViewer — 根据数据快照形状自动选择视图，并允许用户切换
 */
export function DataViewer({ snap, defaultView }: DataViewerProps) {
  const initialView = defaultView ?? resolveView(snap.view, snap.data)
  const [currentView, setCurrentView] = useState<DataView>(initialView)

  const views: DataView[] = ['table', 'kv', 'json', 'card']

  return (
    <div>
      {/* 视图切换按钮组 */}
      <div className="flex items-center gap-1 mb-2">
        {views.map((v) => (
          <button
            key={v}
            onClick={() => setCurrentView(v)}
            className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
              currentView === v
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {v.toUpperCase()}
          </button>
        ))}
        <span className="text-[10px] text-text-muted ml-auto">
          {new Date(snap.updatedAt).toLocaleTimeString()}
        </span>
      </div>

      {/* 当前视图 */}
      {currentView === 'table' && isTableable(snap.data) && <DataTable rows={snap.data} />}
      {currentView === 'kv' && isKeyValue(snap.data) && <DataKV obj={snap.data} />}
      {currentView === 'card' && isCardable(snap.data) && <DataCards items={snap.data} />}
      {currentView === 'json' && <DataTree data={snap.data} />}

      {/* 用户选择的视图与数据形状不匹配时的降级 */}
      {currentView !== 'json' && !(
        (currentView === 'table' && isTableable(snap.data)) ||
        (currentView === 'kv' && isKeyValue(snap.data)) ||
        (currentView === 'card' && isCardable(snap.data))
      ) && <DataTree data={snap.data} />}
    </div>
  )
}

export default DataViewer

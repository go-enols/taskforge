/**
 * @file ImportPreviewTable — 导入数据预览表格
 * @module renderer/components/data-import
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ChevronDown, ChevronUp, CheckCircle2, HelpCircle } from 'lucide-react'
import type { ParsedRow, DetectableType } from '../../utils/data-import-parser'

interface ImportPreviewTableProps {
  rows: ParsedRow[]
  maxPreview?: number
}

/** Human-readable type labels */
const TYPE_LABELS: Record<DetectableType, string> = {
  scriptParam: 'data.import.typeAccount',
  proxy: 'data.import.typeProxy',
  captcha: 'data.import.typeCaptcha',
  unknown: 'data.import.typeUnknown'
}

/** Priority for column ordering (common fields first) */
const PRIORITY_COLUMNS = [
  'protocol', 'host', 'port', 'username', 'password', 'format',
  'provider', 'apikey', 'balance',
  'templateid', 'pool', 'notes', 'labels', 'data'
]

/**
 * Extract all unique column names from rows, sorted by priority.
 */
function extractColumns(rows: ParsedRow[]): string[] {
  const seen = new Set<string>()

  // Priority columns first
  for (const col of PRIORITY_COLUMNS) {
    for (const row of rows) {
      if (col in row.raw) {
        seen.add(col)
        break
      }
    }
  }

  // Remaining columns alphabetically
  const rest: string[] = []
  for (const row of rows) {
    for (const key of Object.keys(row.raw)) {
      if (!seen.has(key)) {
        rest.push(key)
        seen.add(key)
      }
    }
  }
  rest.sort()

  return [...seen].filter((c) => seen.has(c)).concat(rest.filter((c) => !PRIORITY_COLUMNS.includes(c)))
}

/**
 * ImportPreviewTable — 表格形式预览导入数据
 */
export default function ImportPreviewTable({
  rows,
  maxPreview = 20
}: ImportPreviewTableProps): React.ReactElement {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  const displayRows = expanded ? rows : rows.slice(0, maxPreview)
  const columns = extractColumns(rows)
  const hasMore = rows.length > maxPreview
  const errorCount = rows.filter((r) => r.errors.length > 0).length
  const totalCount = rows.length

  if (rows.length === 0) return <></>

  return (
    <div className="space-y-2">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">
          {t('data.import.previewHint', { shown: displayRows.length, total: rows.length })}
        </p>
        {hasMore && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            {expanded ? (
              <>
                {t('data.import.collapsePreview')}
                <ChevronUp size={14} />
              </>
            ) : (
              <>
                {t('data.import.expandPreview', { total: rows.length })}
                <ChevronDown size={14} />
              </>
            )}
          </button>
        )}
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto border border-border-light rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg-page border-b border-border-light">
              <th className="px-3 py-2 text-left text-xs font-medium text-text-muted w-16">#</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-text-muted w-20">
                {t('data.import.colType')}
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-text-muted w-16">
                {t('data.import.colValid')}
              </th>
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-3 py-2 text-left text-xs font-medium text-text-muted whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => {
              const hasErrors = row.errors.length > 0
              return (
                <tr
                  key={row.index}
                  className={`border-b border-border-light last:border-b-0 transition-colors ${
                    hasErrors ? 'bg-yellow-50/50' : 'hover:bg-bg-page'
                  }`}
                >
                  <td className="px-3 py-2 text-text-muted text-xs">{row.index}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded ${
                        row.detectedType === 'unknown'
                          ? 'bg-gray-100 text-gray-600'
                          : row.detectedType === 'scriptParam'
                            ? 'bg-blue-50 text-blue-600'
                            : row.detectedType === 'proxy'
                              ? 'bg-green-50 text-green-600'
                              : 'bg-purple-50 text-purple-600'
                      }`}
                    >
                      {row.detectedType === 'unknown' ? (
                        <HelpCircle size={12} />
                      ) : hasErrors ? (
                        <AlertTriangle size={12} />
                      ) : (
                        <CheckCircle2 size={12} />
                      )}
                      {t(TYPE_LABELS[row.detectedType])}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {hasErrors ? (
                      <span className="inline-flex items-center gap-1 text-xs text-yellow-600" title={row.errors.join('; ')}>
                        <AlertTriangle size={12} />
                        {row.errors.length}
                      </span>
                    ) : (
                      <CheckCircle2 size={14} className="text-green-500" />
                    )}
                  </td>
                  {columns.map((col) => {
                    const value = row.raw[col] ?? ''
                    const display = value.length > 40 ? value.slice(0, 40) + '...' : value
                    return (
                      <td
                        key={col}
                        className="px-3 py-2 text-text-primary whitespace-nowrap max-w-[200px] truncate"
                        title={value}
                      >
                        {display || '—'}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Error summary ── */}
      {displayRows.some((r) => r.errors.length > 0) && (
        <div className="px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-xs text-yellow-700">
            <AlertTriangle size={14} className="inline mr-1 align-text-bottom" />
            {t('data.import.errorSummary', {
              errorCount: errorCount,
              total: totalCount
            })}
          </p>
        </div>
      )}
    </div>
  )
}

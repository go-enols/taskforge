import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eraser, Download, ScrollText } from 'lucide-react'
import type { TaskLog, TaskLogLevel } from '../../../../shared/types'
import { LOG_LEVEL_STYLES, LOG_LEVELS, LEVEL_LABEL_KEY } from './logViewer.constants'

export interface LogViewerProps {
  logs: TaskLog[]
  /** Max number of recent lines to render. Older ones are trimmed. Default 500. */
  maxLogs?: number
  /** Optional clear handler — if provided, a "clear" button is rendered. */
  onClear?: () => void
  /** Optional export handler — if provided, an "export" button is rendered with the current logs. */
  onExport?: (logs: TaskLog[]) => void
  /** Initial filter. Defaults to 'all'. */
  initialFilter?: 'all' | TaskLogLevel
  /** Optional override for the "empty" copy. */
  emptyTextKey?: string
}

const formatTimestamp = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const LogViewer: React.FC<LogViewerProps> = ({
  logs,
  maxLogs = 500,
  onClear,
  onExport,
  initialFilter = 'all',
  emptyTextKey = 'tasks.noLogs'
}) => {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<'all' | TaskLogLevel>(initialFilter)
  const [autoScroll, setAutoScroll] = useState(true)
  const endRef = useRef<HTMLDivElement | null>(null)

  // Cap the rendered list to the most recent N lines.
  const visible = logs.length > maxLogs ? logs.slice(-maxLogs) : logs
  const filtered = filter === 'all' ? visible : visible.filter((l) => l.level === filter)

  // Per-level counts (over the trimmed visible set, not the full history).
  const levelCounts: Record<TaskLogLevel, number> = { info: 0, warn: 0, error: 0, debug: 0 }
  for (const l of visible) levelCounts[l.level] += 1

  useEffect(() => {
    if (autoScroll && filtered.length > 0) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [filtered.length, autoScroll, filtered])

  return (
    <div className="flex flex-col h-full" data-testid="log-viewer">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-light bg-bg-card">
        <div className="flex items-center gap-1 text-[11px]">
          <button
            type="button"
            data-testid="log-filter-all"
            onClick={() => setFilter('all')}
            className={`px-2 py-0.5 rounded-full border transition-colors ${
              filter === 'all'
                ? 'bg-primary text-white border-primary'
                : 'border-border-light text-text-secondary hover:bg-bg-tertiary'
            }`}
          >
            {`${t('tasks.logFilter.all')} (${visible.length})`}
          </button>
          {LOG_LEVELS.map((level) => {
            const active = filter === level
            return (
              <button
                type="button"
                key={level}
                data-testid={`log-filter-${level}`}
                onClick={() => setFilter(level)}
                className={`px-2 py-0.5 rounded-full border transition-colors ${
                  active
                    ? `${LOG_LEVEL_STYLES[level].replace('text-', 'bg-')}-light border-current ${LOG_LEVEL_STYLES[level]}`
                    : 'border-border-light text-text-secondary hover:bg-bg-tertiary'
                }`}
              >
                {`${t(LEVEL_LABEL_KEY[level])} (${levelCounts[level]})`}
              </button>
            )
          })}
        </div>

        <div className="flex-1" />

        <label className="inline-flex items-center gap-1.5 text-[11px] text-text-muted cursor-pointer select-none">
          <input
            type="checkbox"
            data-testid="log-autoscroll"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="rounded"
          />
          {t('tasks.logFilter.autoScroll')}
        </label>

        {onExport && (
          <button
            type="button"
            data-testid="log-export"
            onClick={() => onExport(logs)}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] text-text-secondary border border-border-light rounded hover:bg-bg-tertiary transition-colors"
            aria-label={t('logs.exportLogs')}
          >
            <Download size={11} />
            {t('common.export')}
          </button>
        )}

        {onClear && (
          <button
            type="button"
            data-testid="log-clear"
            onClick={onClear}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] text-text-secondary border border-border-light rounded hover:bg-bg-tertiary transition-colors"
            aria-label={t('common.delete')}
          >
            <Eraser size={11} />
            {t('common.delete')}
          </button>
        )}
      </div>

      {/* Log list */}
      <div className="flex-1 overflow-y-auto bg-bg-page">
        {visible.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-muted text-xs py-8">
            <ScrollText size={20} className="mr-2 opacity-50" />
            {t(emptyTextKey)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-muted text-xs py-8">
            {t('tasks.logs')}
          </div>
        ) : (
          <div
            className="font-mono text-[11px] leading-relaxed p-2 space-y-0.5"
            data-testid="log-list"
          >
            {filtered.map((log) => (
              <div
                key={log.id}
                data-testid="log-row"
                data-level={log.level}
                className="flex items-start gap-2 hover:bg-bg-card-hover/50 px-1.5 py-0.5 rounded"
              >
                <span className="text-text-muted shrink-0 tabular-nums select-none">
                  {formatTimestamp(log.timestamp)}
                </span>
                <span
                  className={`shrink-0 w-12 font-semibold ${LOG_LEVEL_STYLES[log.level]}`}
                >
                  {`[${log.level.toUpperCase()}]`}
                </span>
                <span className="text-text-secondary break-all whitespace-pre-wrap">
                  {log.message}
                </span>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>
    </div>
  )
}

export default LogViewer

/**
 * @file LogViewer — 任务日志查看器组件
 * @description 展示任务执行日志的实时查看器，支持按日志级别过滤、自动滚动、清除和导出功能。
 *              最多渲染 maxLogs（默认 500）条最新日志，超出部分自动截断。
 * @module renderer/components/common
 */
import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eraser, Download, ScrollText } from 'lucide-react'
import type { TaskLog, TaskLogLevel } from '../../../../shared/types'
import { LOG_LEVEL_STYLES, LOG_LEVELS, LEVEL_LABEL_KEY } from './logViewer.constants'

export interface LogViewerProps {
  /** 日志条目数组 */
  logs: TaskLog[]
  /** 最大渲染行数，超出的老日志被截断。默认 500 */
  maxLogs?: number
  /** 清除回调，传此参数时渲染"清除"按钮 */
  onClear?: () => void
  /** 导出回调，传此参数时渲染"导出"按钮，传入当前全部日志 */
  onExport?: (logs: TaskLog[]) => void
  /** 初始过滤级别。默认 'all' */
  initialFilter?: 'all' | TaskLogLevel
  /** 空状态时的自定义文本 i18n key */
  emptyTextKey?: string
}

/**
 * 格式化 ISO 时间戳为 HH:mm:ss 格式
 * @param iso - ISO 8601 时间字符串
 * @returns 格式化后的时间字符串
 */
const formatTimestamp = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/**
 * LogViewer — 任务日志查看器组件
 *
 * 提供带工具栏的日志查看面板，支持：
 * - 按级别过滤（全部/info/warn/error/debug），每个级别显示计数
 * - 自动滚动到最新日志
 * - 清除当前日志（需 onClear 回调）
 * - 导出全部日志（需 onExport 回调）
 * - 日志行显示时间戳、级别标签和消息内容
 *
 * @param logs           - 日志数组
 * @param maxLogs        - 最大行数
 * @param onClear        - 清除回调
 * @param onExport       - 导出回调
 * @param initialFilter  - 初始过滤级别
 * @param emptyTextKey   - 空状态 i18n key
 */
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

  // 截断超过 maxLogs 的旧日志，根据过滤级别筛选
  const visible = logs.length > maxLogs ? logs.slice(-maxLogs) : logs
  const filtered = filter === 'all' ? visible : visible.filter((l) => l.level === filter)

  // 统计各级别日志数量
  const levelCounts: Record<TaskLogLevel, number> = { info: 0, warn: 0, error: 0, debug: 0 }
  for (const l of visible) levelCounts[l.level] += 1

  // 自动滚动到最新日志
  useEffect(() => {
    if (autoScroll && filtered.length > 0) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [filtered.length, autoScroll, filtered])

  return (
    <div className="flex flex-col h-full" data-testid="log-viewer">
      {/* 工具栏：过滤按钮 + 自动滚动 + 导出 + 清除 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-light bg-bg-card">
        {/* 级别过滤按钮组 */}
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

        {/* 自动滚动开关 */}
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

        {/* 导出按钮 */}
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

        {/* 清除按钮 */}
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

      {/* 日志列表区域 */}
      <div className="flex-1 overflow-y-auto bg-bg-page">
        {visible.length === 0 ? (
          /* 无日志时显示空状态 */
          <div className="flex items-center justify-center h-full text-text-muted text-xs py-8">
            <ScrollText size={20} className="mr-2 opacity-50" />
            {t(emptyTextKey)}
          </div>
        ) : filtered.length === 0 ? (
          /* 有日志但被全部过滤时显示提示 */
          <div className="flex items-center justify-center h-full text-text-muted text-xs py-8">
            {t('tasks.logs')}
          </div>
        ) : (
          /* 日志条目列表 */
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
                {/* 时间戳 */}
                <span className="text-text-muted shrink-0 tabular-nums select-none">
                  {formatTimestamp(log.timestamp)}
                </span>
                {/* 级别标签 */}
                <span
                  className={`shrink-0 w-12 font-semibold ${LOG_LEVEL_STYLES[log.level]}`}
                >
                  {`[${log.level.toUpperCase()}]`}
                </span>
                {/* 日志消息内容 */}
                <span className="text-text-secondary break-all whitespace-pre-wrap">
                  {log.message}
                </span>
              </div>
            ))}
            {/* 自动滚动锚点 */}
            <div ref={endRef} />
          </div>
        )}
      </div>
    </div>
  )
}

export default LogViewer

import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { logApi } from '../api'
import type { AppLog, ListResponse } from '../types'
import { RefreshCw, Download, Trash2, Calendar } from 'lucide-react'
import { SearchInput } from '../components/common'
import { useDebounce } from '../hooks'
import { toast } from '../utils/toast'

const INITIAL_LIMIT = 50

const levelColor: Record<string, string> = {
  debug: 'bg-bg-tertiary text-text-secondary',
  info: 'bg-primary-light text-primary',
  warn: 'bg-warning-light text-warning',
  error: 'bg-danger-light text-danger'
}

const LEVELS = ['debug', 'info', 'warn', 'error'] as const

const levelLabelKey: Record<string, string> = {
  debug: 'logs.levelDebug',
  info: 'logs.levelInfo',
  warn: 'logs.levelWarn',
  error: 'logs.levelError'
}

const Logs: React.FC = () => {
  const { t } = useTranslation()
  const [data, setData] = useState<ListResponse<AppLog> | null>(null)
  const [categories, setCategories] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [level, setLevel] = useState('')
  const [category, setCategory] = useState('')
  const [since, setSince] = useState('')
  const [until, setUntil] = useState('')
  const [loading, setLoading] = useState(false)
  const [limit, setLimit] = useState(INITIAL_LIMIT)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [clearing, setClearing] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await logApi.query(
        level || undefined,
        category || undefined,
        debouncedSearch || undefined,
        since || undefined,
        until || undefined,
        limit
      )
      setData(res)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [level, category, debouncedSearch, since, until, limit])

  const fetchCategories = useCallback(async (): Promise<void> => {
    try {
      const cats = await logApi.getCategories()
      setCategories(cats)
    } catch {
      // Ignore fetch errors
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCategories()
  }, [fetchCategories])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData()
  }, [fetchData])

  const handleRefresh = (): void => {
    fetchData()
    fetchCategories()
  }

  const loadMore = (): void => {
    setLimit((l) => l + INITIAL_LIMIT)
  }

  const handleClearLogs = async (): Promise<void> => {
    setClearing(true)
    try {
      await logApi.deleteLogs()
      setShowClearConfirm(false)
      setLimit(INITIAL_LIMIT)
      fetchData()
    } catch {
      toast.error(t('common.operationFailed'))
    } finally {
      setClearing(false)
    }
  }

  const handleExportLogs = (): void => {
    if (!data?.items.length) return
    const exportData = data.items.map((log) => ({
      timestamp: log.timestamp,
      level: log.level,
      category: log.category,
      message: log.message,
      fields: log.fields
    }))
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `logs_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const formatTime = (ts: string): string => {
    try {
      return new Date(ts).toLocaleString()
    } catch {
      return ts
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('logs.title')}</h1>
        <div className="flex items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('common.search') + '...'}
            inputClassName="pl-9 pr-3 py-1.5 text-sm border border-border-light rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary w-48"
          />
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="px-3 py-1.5 text-sm border border-border-light rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">{t('logs.level')}</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {t(levelLabelKey[l])}
              </option>
            ))}
          </select>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-3 py-1.5 text-sm border border-border-light rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary max-w-40"
          >
            <option value="">{t('common.type')}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <Calendar size={14} className="text-text-muted" />
            <input
              type="date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              className="px-2 py-1.5 text-sm border border-border-light rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <span className="text-text-muted text-xs">~</span>
            <input
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className="px-2 py-1.5 text-sm border border-border-light rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <button
            onClick={handleExportLogs}
            disabled={!data?.items.length}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border-light rounded-lg hover:bg-bg-tertiary transition-colors disabled:opacity-40"
          >
            <Download size={16} />
            {t('logs.exportLogs')}
          </button>
          <button
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-danger/30 text-danger rounded-lg hover:bg-danger-light transition-colors"
          >
            <Trash2 size={16} />
            {t('logs.clearLogs')}
          </button>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border-light rounded-lg hover:bg-bg-tertiary transition-colors"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            {t('common.refresh')}
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="text-center py-12 text-text-muted">{t('common.loading')}</div>
      ) : !data?.items.length ? (
        <div className="text-center py-12 text-text-muted">{t('logs.noLogs')}</div>
      ) : (
        <>
          <div className="overflow-x-auto border border-border-light  rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-bg-tertiary">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-text-secondary w-44">
                    {t('logs.timestamp')}
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-text-secondary w-20">
                    {t('logs.level')}
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-text-secondary w-32">
                    {t('common.type')}
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-text-secondary">
                    {t('logs.message')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {data.items.map((log) => (
                  <tr key={log.id} className="hover:bg-bg-tertiary">
                    <td className="px-4 py-2.5 font-mono text-xs text-text-muted">
                      {formatTime(log.timestamp)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${levelColor[log.level] || levelColor.debug}`}
                      >
                        {t(levelLabelKey[log.level] || log.level)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-text-secondary">{log.category}</td>
                    <td className="px-4 py-2.5 text-xs font-mono break-all max-w-xl">
                      {log.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.items.length < data.total && (
            <div className="flex justify-center">
              <button
                onClick={loadMore}
                className="px-4 py-1.5 text-sm border border-border-light rounded-lg hover:bg-bg-tertiary transition-colors"
              >
                {t('logs.loadMore')} ({data.items.length}/{data.total})
              </button>
            </div>
          )}
        </>
      )}

      {showClearConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowClearConfirm(false)}
        >
          <div
            className="bg-bg-card rounded-xl shadow-xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-2">{t('logs.clearLogs')}</h2>
            <p className="text-sm text-text-secondary mb-6">{t('logs.confirmClearLogs')}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-1.5 text-sm border border-border-light rounded-lg hover:bg-bg-tertiary"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleClearLogs}
                disabled={clearing}
                className="px-4 py-1.5 text-sm bg-danger text-white rounded-lg hover:bg-danger-hover disabled:opacity-50"
              >
                {clearing ? t('common.loading') : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Logs

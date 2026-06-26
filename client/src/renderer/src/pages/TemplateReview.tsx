/**
 * @file TemplateReview — 模板审核页面
 * @description 管理员审核数据模板（Account templates）并管理项目模板（Project templates）可见性。
 *              Tab 1: 数据模板审核
 *              Tab 2: 项目模板可见性管理
 * @module renderer/pages
 */
import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, X, Clock } from 'lucide-react'
import { marketplaceApi } from '../api'
import { useAuth } from '../contexts/AuthContext'
import { toast } from '../utils/toast'
import type { RemoteTemplate, RemoteProjectTemplate } from '../../../shared/types'

type Tab = 'data' | 'project'

export default function TemplateReview(): React.JSX.Element {
  const { t } = useTranslation()
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState<Tab>('data')

  // 数据模板（服务端审核）
  const [templates, setTemplates] = useState<RemoteTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({})
  const [reviewingId, setReviewingId] = useState<string | null>(null)

  // 项目模板（本地管理可见性）
  const [projectTemplates, setProjectTemplates] = useState<RemoteProjectTemplate[]>([])
  const [projectLoading, setProjectLoading] = useState(true)
  const [projectComments, setProjectComments] = useState<Record<string, string>>({})
  const [projectReviewingId, setProjectReviewingId] = useState<string | null>(null)

  const fetchDataTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await marketplaceApi.getPendingTemplates()
      setTemplates(res.data?.items || [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '获取待审核模板失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchProjectTemplates = useCallback(async () => {
    setProjectLoading(true)
    try {
      const res = await marketplaceApi.getPendingProjectTemplates()
      setProjectTemplates(res.data?.items || [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '获取项目模板失败')
    } finally {
      setProjectLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    if (tab === 'data') fetchDataTemplates()
    else fetchProjectTemplates()
  }, [tab, fetchDataTemplates, fetchProjectTemplates, isAdmin])

  const handleTemplateReview = async (id: string, action: 'approve' | 'reject') => {
    setReviewingId(id)
    const comment = reviewComments[id] ?? ''
    try {
      await marketplaceApi.reviewTemplate(id, action, comment)
      toast.success(action === 'approve' ? '已批准' : '已拒绝')
      setReviewComments((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      fetchDataTemplates()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '审核失败')
    } finally {
      setReviewingId(null)
    }
  }

  const handleProjectReview = async (id: string, action: 'approve' | 'reject') => {
    setProjectReviewingId(id)
    const comment = projectComments[id] ?? ''
    try {
      await marketplaceApi.reviewProjectTemplate(id, action, comment)
      toast.success(action === 'approve' ? '已批准' : '已拒绝')
      setProjectComments((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      fetchProjectTemplates()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '审核失败')
    } finally {
      setProjectReviewingId(null)
    }
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-text-secondary text-sm">{t('auth.noAccess')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b border-border-light">
        <button
          onClick={() => setTab('data')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'data'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-muted hover:text-text-primary'
          }`}
        >
          数据模板审核
        </button>
        <button
          onClick={() => setTab('project')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'project'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-muted hover:text-text-primary'
          }`}
        >
          项目模板管理
        </button>
      </div>

      {tab === 'data' ? (
        <DataTemplateReview
          templates={templates}
          loading={loading}
          reviewComments={reviewComments}
          reviewingId={reviewingId}
          setReviewComments={setReviewComments}
          onRefresh={fetchDataTemplates}
          onReview={handleTemplateReview}
          t={t}
        />
      ) : (
        <DataTemplateReview
          templates={projectTemplates}
          loading={projectLoading}
          reviewComments={projectComments}
          reviewingId={projectReviewingId}
          setReviewComments={setProjectComments}
          onRefresh={fetchProjectTemplates}
          onReview={handleProjectReview}
          t={t}
          titlePrefix="项目模板"
          getMeta={(item) => item.fields?.length + ' 个字段'}
        />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════
   Data template review sub-component
   ═══════════════════════════════════════════ */

function DataTemplateReview<T extends { id: string; name: string; description?: string | null; version?: string; type?: string; updatedAt?: string; createdAt?: string }>(props: {
  templates: T[]
  loading: boolean
  reviewComments: Record<string, string>
  reviewingId: string | null
  setReviewComments: React.Dispatch<React.SetStateAction<Record<string, string>>>
  onRefresh: () => void
  onReview: (id: string, action: 'approve' | 'reject') => Promise<void>
  t: (k: string, opts?: Record<string, unknown>) => string
  titlePrefix?: string
  /** optional extra info per item, shown alongside the name */
  getMeta?: (item: T) => string
}): React.JSX.Element {
  const { templates, loading, reviewComments, reviewingId, setReviewComments, onRefresh, onReview, t, titlePrefix, getMeta } = props

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{titlePrefix ? titlePrefix + '审核' : '数据模板审核'}</h1>
          <p className="text-text-muted text-sm">
            {t('review.pendingCount', { count: templates.length })}
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50"
        >
          {t('common.refresh')}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : templates.length === 0 ? (
        <div className="bg-bg-card rounded-xl border border-border-light p-12 text-center">
          <Clock size={48} className="mx-auto mb-4 text-text-muted" />
          <p className="text-text-muted">{t('review.noPending')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((item) => (
            <div
              key={item.id}
              className="bg-bg-card rounded-xl border border-border-light p-4"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium text-text-primary">{item.name}</h3>
                    {item.version && (
                      <span className="text-xs px-2 py-0.5 rounded bg-bg-tertiary text-text-muted font-mono">
                        v{item.version}
                      </span>
                    )}
                    {item.type && (
                      <span className="text-xs px-2 py-0.5 rounded bg-bg-tertiary text-text-muted font-mono">
                        {item.type}
                      </span>
                    )}
                    {getMeta && (
                      <span className="text-xs px-2 py-0.5 rounded bg-bg-tertiary text-text-muted font-mono">
                        {getMeta(item)}
                      </span>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded bg-warning/10 text-warning flex items-center gap-1">
                      <Clock size={12} />
                      {t('review.pending')}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted font-mono mt-1">ID: {item.id}</p>
                </div>
              </div>
              {item.updatedAt && (
                <p className="text-xs text-text-muted mt-1">
                  {t('developerPending.submitted')}: {new Date(item.updatedAt).toLocaleString()}
                </p>
              )}

              {item.description && (
                <p className="text-sm text-text-secondary mb-3">{item.description}</p>
              )}

              <div className="mb-3">
                <label className="block text-xs text-text-muted mb-1">
                  {t('review.comment')}
                </label>
                <textarea
                  value={reviewComments[item.id] ?? ''}
                  onChange={(e) => {
                    setReviewComments((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }}
                  placeholder={t('review.commentPlaceholder')}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-border-light bg-bg-input text-sm text-text-primary focus:border-primary outline-none transition-colors resize-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => onReview(item.id, 'approve')}
                  disabled={reviewingId === item.id}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-success text-white hover:bg-success/90 disabled:opacity-50 transition-colors"
                >
                  <Check size={14} />
                  {t('review.approve')}
                </button>
                <button
                  onClick={() => onReview(item.id, 'reject')}
                  disabled={reviewingId === item.id}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-danger text-white hover:bg-danger/90 disabled:opacity-50 transition-colors"
                >
                  <X size={14} />
                  {t('review.reject')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

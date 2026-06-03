import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { marketplaceApi, getMarketplaceUrl } from '../api'
import { useAuth } from '../contexts/AuthContext'
import { toast } from '../utils/toast'
import { Check, X, Clock, FileText, Zap, ChevronDown, ChevronRight, Download } from 'lucide-react'
import type { RemoteScript, RemoteTemplate } from '../types'

type TabType = 'scripts' | 'templates'

export default function AdminReviewPage() {
  const { t } = useTranslation()
  const { isAdmin } = useAuth()
  const [activeTab, setActiveTab] = useState<TabType>('scripts')
  const [scripts, setScripts] = useState<RemoteScript[]>([])
  const [templates, setTemplates] = useState<RemoteTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [reviewComment, setReviewComment] = useState('')
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

  const toggleExpanded = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const fetchPending = useCallback(async () => {
    setLoading(true)
    try {
      const [scriptsRes, templatesRes] = await Promise.all([
        marketplaceApi.getPendingScripts(),
        marketplaceApi.getPendingTemplates()
      ])
      setScripts(scriptsRes.data?.items || [])
      setTemplates(templatesRes.data?.items || [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '获取待审核项目失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPending()
  }, [fetchPending])

  const handleReview = async (type: 'script' | 'template', id: string, action: 'approve' | 'reject') => {
    setReviewingId(id)
    try {
      if (type === 'script') {
        await marketplaceApi.reviewScript(id, action, reviewComment)
      } else {
        await marketplaceApi.reviewTemplate(id, action, reviewComment)
      }
      toast.success(action === 'approve' ? '已批准' : '已拒绝')
      setReviewComment('')
      fetchPending()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '审核失败')
    } finally {
      setReviewingId(null)
    }
  }

  const downloadScript = async (item: RemoteScript) => {
    try {
      const base = await getMarketplaceUrl()
      const url = `${base}${item.downloadUrl}`
      window.open(url, '_blank')
    } catch {
      toast.error('获取下载链接失败')
    }
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-text-secondary text-sm">{t('auth.noAccess')}</p>
      </div>
    )
  }

  const items = activeTab === 'scripts' ? scripts : templates
  const totalPending = scripts.length + templates.length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('review.title')}</h1>
          <p className="text-text-muted text-sm">
            {t('review.pendingCount', { count: totalPending })}
          </p>
        </div>
        <button
          onClick={fetchPending}
          disabled={loading}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50"
        >
          {t('common.refresh')}
        </button>
      </div>

      <div className="flex gap-2 border-b border-border-light pb-0">
        <button
          onClick={() => setActiveTab('scripts')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors -mb-[1px] border-b-2 ${
            activeTab === 'scripts'
              ? 'text-primary border-primary bg-primary/5'
              : 'text-text-muted border-transparent hover:text-text-secondary'
          }`}
        >
          <Zap size={16} />
          {t('review.scripts')} ({scripts.length})
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors -mb-[1px] border-b-2 ${
            activeTab === 'templates'
              ? 'text-primary border-primary bg-primary/5'
              : 'text-text-muted border-transparent hover:text-text-secondary'
          }`}
        >
          <FileText size={16} />
          {t('review.templates')} ({templates.length})
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-bg-card rounded-xl border border-border-light p-12 text-center">
          <Clock size={48} className="mx-auto mb-4 text-text-muted" />
          <p className="text-text-muted">{t('review.noPending')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-bg-card rounded-xl border border-border-light p-4"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-medium text-text-primary">{item.name}</h3>
                  <p className="text-xs text-text-muted font-mono mt-1">
                    ID: {item.id} · v{item.version}
                  </p>
                  {item.createdBy && (
                    <p className="text-xs text-text-muted mt-1">
                      {t('review.author')}: {item.createdBy}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {activeTab === 'scripts' && (
                    <button
                      onClick={() => downloadScript(item as RemoteScript)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border-light text-xs text-text-muted hover:text-primary hover:border-primary transition-colors"
                      title={t('review.downloadToInspect')}
                    >
                      <Download size={14} />
                      {t('review.downloadToInspect')}
                    </button>
                  )}
                  <span className="text-xs px-2 py-0.5 rounded bg-warning/10 text-warning">
                    {t('review.pending')}
                  </span>
                </div>
              </div>

              {/* Description */}
              {item.description && (
                <p className="text-sm text-text-secondary mb-3">{item.description}</p>
              )}

              {/* Expandable details */}
              <button
                onClick={() => toggleExpanded(item.id)}
                className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary mb-3 transition-colors"
              >
                {expandedItems.has(item.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {expandedItems.has(item.id) ? t('review.hideSchema') : t('review.viewSchema')}
              </button>

              {expandedItems.has(item.id) && (
                <div className="mb-3 pl-2 border-l-2 border-border-light space-y-3">
                  {/* Schema JSON viewer */}
                  <div>
                    <p className="text-xs font-medium text-text-muted mb-1">{t('review.schema')}</p>
                    <pre className="bg-bg-input rounded-lg p-3 text-xs text-text-secondary overflow-x-auto max-h-64 overflow-y-auto font-mono whitespace-pre-wrap">
                      {JSON.stringify(item.schema, null, 2)}
                    </pre>
                  </div>

                  {/* Script-specific fields */}
                  {activeTab === 'scripts' && (
                    <>
                      <div>
                        <p className="text-xs font-medium text-text-muted mb-1">{t('review.entryPoint')}</p>
                        <code className="text-xs text-text-secondary bg-bg-input px-2 py-0.5 rounded font-mono">
                          {(item as RemoteScript).entryPoint || '—'}
                        </code>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-text-muted mb-1">{t('review.checksum')}</p>
                        <code className="text-xs text-text-secondary bg-bg-input px-2 py-0.5 rounded font-mono break-all">
                          {(item as RemoteScript).checksum || '—'}
                        </code>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-text-muted mb-1">{t('review.tags')}</p>
                        {(item as RemoteScript).tags && (item as RemoteScript).tags!.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {(item as RemoteScript).tags!.map((tag) => (
                              <span
                                key={tag}
                                className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-text-muted">{t('review.noTags')}</span>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-text-muted mb-1">{t('review.changelog')}</p>
                        <p className="text-xs text-text-secondary whitespace-pre-wrap">
                          {(item as RemoteScript).changelog || t('review.noChangelog')}
                        </p>
                      </div>
                    </>
                  )}

                  {/* Template-specific: show type */}
                  {activeTab === 'templates' && (
                    <div>
                      <p className="text-xs font-medium text-text-muted mb-1">{t('review.type')}</p>
                      <span className="text-xs text-text-secondary bg-bg-input px-2 py-0.5 rounded">
                        {(item as RemoteTemplate).type || '—'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Review comment */}
              <div className="mb-3">
                <label className="block text-xs text-text-muted mb-1">
                  {t('review.comment')}
                </label>
                <textarea
                  value={reviewingId === item.id ? reviewComment : ''}
                  onChange={(e) => {
                    setReviewComment(e.target.value)
                    setReviewingId(item.id)
                  }}
                  placeholder={t('review.commentPlaceholder')}
                  className="w-full px-3 py-2 rounded-lg border border-border-light bg-bg-input text-sm text-text-primary focus:border-primary outline-none resize-none"
                  rows={2}
                />
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleReview(activeTab === 'scripts' ? 'script' : 'template', item.id, 'approve')}
                  disabled={reviewingId === item.id}
                  className="flex items-center gap-1 px-4 py-2 rounded-lg bg-success text-white text-sm font-medium hover:bg-success/90 disabled:opacity-50 transition-colors"
                >
                  <Check size={16} />
                  {t('review.approve')}
                </button>
                <button
                  onClick={() => handleReview(activeTab === 'scripts' ? 'script' : 'template', item.id, 'reject')}
                  disabled={reviewingId === item.id}
                  className="flex items-center gap-1 px-4 py-2 rounded-lg bg-danger text-white text-sm font-medium hover:bg-danger/90 disabled:opacity-50 transition-colors"
                >
                  <X size={16} />
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

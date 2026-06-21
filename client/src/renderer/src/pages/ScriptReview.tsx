/**
 * @file ScriptReview — 脚本审核页面
 * @description 管理员审核开发者提交的脚本。
 *              拒绝操作将脚本设为不可见并保留记录，供开发者查看审核意见。
 * @module renderer/pages
 */
import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, X, Clock, ChevronDown, ChevronRight, Download } from 'lucide-react'
import { marketplaceApi, getMarketplaceUrl } from '../api'
import { useAuth } from '../contexts/AuthContext'
import { toast } from '../utils/toast'
import type { RemoteScript } from '../types'

export default function ScriptReview(): React.JSX.Element {
  const { t } = useTranslation()
  const { isAdmin } = useAuth()
  const [scripts, setScripts] = useState<RemoteScript[]>([])
  const [loading, setLoading] = useState(true)
  /** 每个待审核项独立的评论输入框（key = item.id） */
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({})
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

  const fetchPending = useCallback(async () => {
    setLoading(true)
    try {
      const res = await marketplaceApi.getPendingScripts()
      setScripts(res.data?.items || [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '获取待审核脚本失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) fetchPending()
  }, [fetchPending, isAdmin])

  const handleReview = async (id: string, action: 'approve' | 'reject') => {
    setReviewingId(id)
    const comment = reviewComments[id] ?? ''
    try {
      await marketplaceApi.reviewScript(id, action, comment)
      if (action === 'reject') {
        toast.success('已拒绝，脚本已下架')
      } else {
        toast.success('已批准，脚本已发布')
      }
      // 清理已审核项的评论输入
      setReviewComments((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      // 重新拉取待审核列表
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
      window.open(`${base}${item.downloadUrl}`, '_blank')
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('review.scripts')}</h1>
          <p className="text-text-muted text-sm">
            {t('review.pendingCount', { count: scripts.length })}
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

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : scripts.length === 0 ? (
        <div className="bg-bg-card rounded-xl border border-border-light p-12 text-center">
          <Clock size={48} className="mx-auto mb-4 text-text-muted" />
          <p className="text-text-muted">{t('review.noPending')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {scripts.map((item) => {
            const expanded = expandedItems.has(item.id)
            return (
              <div
                key={item.id}
                className="bg-bg-card rounded-xl border border-border-light p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-text-primary">{item.name}</h3>
                      <span className="text-xs px-2 py-0.5 rounded bg-bg-tertiary text-text-muted font-mono">
                        v{item.version}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded bg-warning/10 text-warning flex items-center gap-1">
                        <Clock size={12} />
                        {t('review.pending')}
                      </span>
                    </div>
                    <p className="text-xs text-text-muted font-mono mt-1">ID: {item.id}</p>
                    <p className="text-xs text-text-muted mt-1">
                      {t('developerPending.submitted')}: {new Date(item.updatedAt).toLocaleString()}
                    </p>
                    {item.createdByName && (
                      <p className="text-xs text-text-muted mt-1">提交者: {item.createdByName}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => downloadScript(item)}
                      className="p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                      title="下载脚本 ZIP"
                    >
                      <Download size={14} />
                    </button>
                    <button
                      onClick={() => {
                        setExpandedItems((prev) => {
                          const next = new Set(prev)
                          if (next.has(item.id)) next.delete(item.id)
                          else next.add(item.id)
                          return next
                        })
                      }}
                      className="p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                      title={expanded ? '收起' : '展开'}
                    >
                      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  </div>
                </div>

                {item.description && (
                  <p className="text-sm text-text-secondary mb-3">{item.description}</p>
                )}

                {item.tags && item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {expanded && (
                  <div className="mt-3 p-3 bg-bg-tertiary rounded-lg text-xs space-y-2">
                    <div>
                      <span className="text-text-muted">入口点: </span>
                      <span className="font-mono">{item.entryPoint}</span>
                    </div>
                    <div>
                      <span className="text-text-muted">校验和: </span>
                      <span className="font-mono break-all">{item.checksum}</span>
                    </div>
                    {item.changelog && (
                      <div>
                        <span className="text-text-muted">更新日志: </span>
                        <span>{item.changelog}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="mb-3 mt-3">
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
                  <p className="text-xs text-text-muted mt-1">
                    拒绝时该说明会作为审核意见保留，开发者可在我的脚本中查看（可选填）
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleReview(item.id, 'approve')}
                    disabled={reviewingId === item.id}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-success text-white hover:bg-success/90 disabled:opacity-50 transition-colors"
                  >
                    <Check size={14} />
                    {t('review.approve')}
                  </button>
                  <button
                    onClick={() => handleReview(item.id, 'reject')}
                    disabled={reviewingId === item.id}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-danger text-white hover:bg-danger/90 disabled:opacity-50 transition-colors"
                  >
                    <X size={14} />
                    {t('review.reject')} (下架)
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

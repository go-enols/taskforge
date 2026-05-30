import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { marketplaceApi } from '../api'
import { useAuth } from '../contexts/AuthContext'
import { toast } from 'sonner'
import { Clock, FileText, Zap, CheckCircle, XCircle, MessageSquare } from 'lucide-react'
import type { RemoteScript, RemoteTemplate } from '../types'

type TabType = 'scripts' | 'templates'

export default function DeveloperPendingPage() {
  const { t } = useTranslation()
  const { isDeveloper } = useAuth()
  const [activeTab, setActiveTab] = useState<TabType>('scripts')
  const [scripts, setScripts] = useState<RemoteScript[]>([])
  const [templates, setTemplates] = useState<RemoteTemplate[]>([])
  const [loading, setLoading] = useState(true)

  const fetchPending = useCallback(async () => {
    setLoading(true)
    try {
      const [scriptsRes, templatesRes] = await Promise.all([
        marketplaceApi.getMyPendingScripts(),
        marketplaceApi.getMyPendingTemplates()
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

  if (!isDeveloper) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-text-secondary text-sm">{t('auth.noAccess')}</p>
      </div>
    )
  }

  const items = activeTab === 'scripts' ? scripts : templates
  const totalPending = scripts.length + templates.length

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="text-xs px-2 py-0.5 rounded bg-success/10 text-success flex items-center gap-1">
            <CheckCircle size={12} />
            {t('review.approved')}
          </span>
        )
      case 'rejected':
        return (
          <span className="text-xs px-2 py-0.5 rounded bg-danger/10 text-danger flex items-center gap-1">
            <XCircle size={12} />
            {t('review.rejected')}
          </span>
        )
      default:
        return (
          <span className="text-xs px-2 py-0.5 rounded bg-warning/10 text-warning flex items-center gap-1">
            <Clock size={12} />
            {t('review.pending')}
          </span>
        )
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('developerPending.title')}</h1>
          <p className="text-text-muted text-sm">
            {t('developerPending.pendingCount', { count: totalPending })}
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
          <p className="text-text-muted">{t('developerPending.noPending')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-bg-card rounded-xl border border-border-light p-4"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-medium text-text-primary">{item.name}</h3>
                  <p className="text-xs text-text-muted font-mono mt-1">
                    ID: {item.id} · v{item.version}
                  </p>
                  <p className="text-xs text-text-muted mt-1">
                    {t('developerPending.submitted')}: {new Date(item.updatedAt).toLocaleString()}
                  </p>
                </div>
                {getStatusBadge(item.reviewStatus)}
              </div>

              {item.description && (
                <p className="text-sm text-text-secondary mb-3">{item.description}</p>
              )}

              {item.reviewComment && (
                <div className="mt-3 p-3 bg-bg-tertiary rounded-lg">
                  <div className="flex items-center gap-1 text-xs text-text-muted mb-1">
                    <MessageSquare size={12} />
                    {t('review.adminComment')}:
                  </div>
                  <p className="text-sm text-text-secondary">{item.reviewComment}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

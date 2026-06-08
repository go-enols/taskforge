/**
 * @file Templates — 模板市场页
 * @description 展示远端和本地的参数模板及任务脚本，支持浏览、安装、删除和管理。
 * 包含参数模板和脚本模板列表。
 * @module renderer/pages
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { templateApi, marketplaceApi, getMarketplaceUrl, scriptApi, dialogApi } from '../api'
import { useAuth } from '../contexts/AuthContext'
import { toast } from '../utils/toast'
import type { Template, RemoteTemplate, RemoteScript, InstalledScript } from '../types'
import {
  Search,
  Download,
  RefreshCw,
  Globe,
  FileText,
  Users,
  Zap,
  ChevronDown,
  Trash2,
  Upload
} from 'lucide-react'

/**
 * Templates — 模板市场页面组件
 *
 * 两个标签页：参数模板（远程/已安装）、任务脚本（远程/已安装）。
 * 支持搜索、安装/卸载、以及管理可见性操作。
 */
const Templates: React.FC = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user: marketUser, isAdmin, isDeveloper } = useAuth()
  const canManage = isAdmin || isDeveloper
  const [activeTab, setActiveTab] = useState<'templates' | 'scripts'>('templates')
  const [marketplaceUrl, setMarketplaceUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [scriptParamTemplates, setScriptParamTemplates] = useState<RemoteTemplate[]>([])
  const [installedTemplates, setInstalledTemplates] = useState<Template[]>([])
  const [taskScripts, setTaskScripts] = useState<RemoteScript[]>([])
  const [installedScripts, setInstalledScripts] = useState<InstalledScript[]>([])
  const [installingId, setInstallingId] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search])

  const loadInstalled = useCallback(async () => {
    try {
      const [tplRes, scriptRes] = await Promise.all([
        templateApi.list(1, 999),
        scriptApi.listInstalled()
      ])
      setInstalledTemplates(tplRes.items || [])
      setInstalledScripts(scriptRes || [])
    } catch (err) {
      console.error('[Templates] Failed to load installed templates/scripts:', err)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadInstalled()
  }, [loadInstalled])

  const fetchMarketplace = useCallback(
    async (urlOverride?: string, silent = false) => {
      const baseUrl = urlOverride ?? marketplaceUrl
      if (!baseUrl) return
      if (!silent) setLoading(true)
      if (!silent) setError(null)
      try {
        const [tplRes, scriptRes] = await Promise.all([
          marketplaceApi.listTemplates(baseUrl),
          marketplaceApi.listScripts(baseUrl)
        ])
        setScriptParamTemplates(tplRes.items || [])
        setTaskScripts(scriptRes.items || [])
      } catch (e: unknown) {
        if (!silent) setError(e instanceof Error ? e.message : t('common.error'))
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [marketplaceUrl, t]
  )

  // Initial fetch on mount
  useEffect(() => {
    getMarketplaceUrl().then((url) => {
      setMarketplaceUrl(url)
      if (url) fetchMarketplace(url)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Silent auto-refresh: poll marketplace every 30 seconds
  useEffect(() => {
    if (!marketplaceUrl) return
    const timer = setInterval(() => {
      fetchMarketplace(undefined, true)
    }, 30000)
    return () => clearInterval(timer)
  }, [marketplaceUrl, fetchMarketplace])

  // Refresh when tab/window regains focus
  useEffect(() => {
    const handleVisible = (): void => {
      if (document.visibilityState === 'visible' && marketplaceUrl) {
        fetchMarketplace(undefined, true)
      }
    }
    document.addEventListener('visibilitychange', handleVisible)
    return () => document.removeEventListener('visibilitychange', handleVisible)
  }, [marketplaceUrl, fetchMarketplace])

  const handleInstallTemplate = async (tmpl: RemoteTemplate): Promise<void> => {
    setInstallingId(tmpl.id)
    try {
      await marketplaceApi.installTemplate(marketplaceUrl, tmpl)
      await loadInstalled()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('common.error'))
    } finally {
      setInstallingId(null)
    }
  }

  const handleInstallScript = async (id: string): Promise<void> => {
    setInstallingId(id)
    try {
      const installed = await scriptApi.download(id)
      await loadInstalled()
      // 若 ScriptFetcher 检测到脚本所需的参数模板本地未下载, 提示用户去 Marketplace 下载
      if (installed?.missingAccountTemplates && installed.missingAccountTemplates.length > 0) {
        toast.warning(
          t('templates.scriptNeedsTemplates', {
            count: installed.missingAccountTemplates.length
          })
        )
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('common.error'))
    } finally {
      setInstallingId(null)
    }
  }

  const handleToggleVisibility = async (
    type: 'template' | 'script',
    id: string,
    currentVisible: boolean
  ): Promise<void> => {
    const newVisible = !currentVisible
    // Optimistic update
    if (type === 'template') {
      setScriptParamTemplates((prev) =>
        prev.map((t) => (t.id === id ? { ...t, visible: newVisible } : t))
      )
    } else {
      setTaskScripts((prev) =>
        prev.map((s) => (s.id === id ? { ...s, visible: newVisible } : s))
      )
    }
    try {
      if (type === 'template') {
        await marketplaceApi.patchTemplate(id, { visible: newVisible })
      } else {
        await marketplaceApi.patchScript(id, { visible: newVisible })
      }
      toast.success(newVisible ? '已设为可见' : '已设为隐藏')
      fetchMarketplace()
    } catch (e: unknown) {
      // Revert on error
      if (type === 'template') {
        setScriptParamTemplates((prev) =>
          prev.map((t) => (t.id === id ? { ...t, visible: currentVisible } : t))
        )
      } else {
        setTaskScripts((prev) =>
          prev.map((s) => (s.id === id ? { ...s, visible: currentVisible } : s))
        )
      }
      toast.error(e instanceof Error ? e.message : t('common.error'))
    }
  }

  const handleDeleteScript = async (id: string): Promise<void> => {
    try {
      await marketplaceApi.deleteScript(id)
      toast.success('脚本已删除')
      fetchMarketplace()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('common.error'))
    }
  }

  const handleDeleteTemplate = async (id: string): Promise<void> => {
    try {
      await marketplaceApi.deleteTemplate(id)
      toast.success('模板已删除')
      fetchMarketplace()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('common.error'))
    }
  }

  const canDeleteItem = (createdBy?: string) => {
    if (!marketUser) return false
    if (marketUser.role === 'admin') return true
    return createdBy === marketUser.id
  }

  const handleUninstallScript = async (id: string): Promise<void> => {
    try {
      await scriptApi.remove(id)
      toast.success('脚本已卸载')
      loadInstalled()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('common.error'))
    }
  }

  const handleUninstallTemplate = async (tmpl: RemoteTemplate): Promise<void> => {
    try {
      const count = await templateApi.checkScriptParams(tmpl.id)
      if (count > 0) {
        toast.error(`该模板仍有 ${count} 个关联账号，请先删除对应账号后再卸载模板`)
        return
      }
      await templateApi.delete(tmpl.id)
      toast.success('模板已卸载')
      loadInstalled()
      fetchMarketplace()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('common.error'))
    }
  }

  const handleReuploadScript = async (id: string): Promise<void> => {
    const result = await dialogApi.openFile([{ name: 'ZIP Files', extensions: ['zip'] }])
    if (result.canceled || !result.filePath) return
    try {
      const uploadResult = await marketplaceApi.reuploadScript(id, result.filePath)
      const data = uploadResult as { success?: boolean; error?: { message?: string } }
      if (data?.success === false) {
        toast.error(data.error?.message || '上传失败')
        return
      }
      toast.success('脚本已更新，等待管理员审核')
      fetchMarketplace()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('common.error'))
    }
  }

  const filteredTemplates = useMemo(() => {
    if (!debouncedSearch.trim()) return scriptParamTemplates
    const q = debouncedSearch.toLowerCase()
    return scriptParamTemplates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.type.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
    )
  }, [scriptParamTemplates, debouncedSearch])

  const filteredScripts = useMemo(() => {
    if (!debouncedSearch.trim()) return taskScripts
    const q = debouncedSearch.toLowerCase()
    return taskScripts.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q))
    )
  }, [taskScripts, debouncedSearch])

  const getTemplateStatus = (id: string, version: string) => {
    const installed = installedTemplates.find((i) => i.id === id)
    if (!installed) return 'none' as const
    if (installed.version !== version) return 'update' as const
    return 'installed' as const
  }

  const getScriptStatus = (id: string, version: string) => {
    const installed = installedScripts.find((i) => i.id === id)
    if (!installed) return 'none' as const
    if (installed.version !== version) return 'update' as const
    return 'installed' as const
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('templates.title')}</h1>
        <div className="flex items-center gap-2">
          <Globe size={16} className="text-text-muted" />
          <span className="text-xs text-text-muted font-mono">{marketplaceUrl || 'http://localhost:3400'}</span>
          <button
            onClick={() => fetchMarketplace()}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            {t('common.refresh')}
          </button>
        </div>
      </div>

      {marketUser && (
        <div className="flex items-center gap-3 px-4 py-2 bg-primary/5 border border-primary/20 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold">
            {marketUser.displayName?.charAt(0).toUpperCase() || 'U'}
          </div>
          <span className="text-sm font-medium text-text-primary">{marketUser.displayName}</span>
          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
            marketUser.role === 'admin'
              ? 'bg-purple/10 text-purple'
              : marketUser.role === 'developer'
                ? 'bg-primary/10 text-primary'
                : 'bg-text-muted/10 text-text-muted'
          }`}>
            {marketUser.role === 'admin' ? '管理员' : marketUser.role === 'developer' ? '开发者' : '用户'}
          </span>
        </div>
      )}

      <div className="flex gap-2 border-b border-border-light pb-0">
        <button
          onClick={() => setActiveTab('templates')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors -mb-[1px] border-b-2 ${
            activeTab === 'templates'
              ? 'text-primary border-primary bg-primary/5'
              : 'text-text-muted border-transparent hover:text-text-secondary'
          }`}
        >
          <Users size={16} />
          {t('templates.scriptParamTemplates')} ({scriptParamTemplates.length})
        </button>
        <button
          onClick={() => setActiveTab('scripts')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors -mb-[1px] border-b-2 ${
            activeTab === 'scripts'
              ? 'text-primary border-primary bg-primary/5'
              : 'text-text-muted border-transparent hover:text-text-secondary'
          }`}
        >
          <Zap size={16} />
          {t('templates.taskScripts')} ({taskScripts.length})
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('common.search')}
            className="pl-9 pr-3 py-2 text-sm border border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary w-full"
          />
        </div>
      </div>

      {error && (
        <div className="text-danger text-sm bg-danger-light border border-danger/30 rounded-lg px-4 py-2 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-danger font-bold ml-2">
            ×
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-text-muted">
          <RefreshCw size={24} className="animate-spin mr-2" />
          <span>{t('common.loading')}</span>
        </div>
      ) : (
        <>
          {activeTab === 'templates' &&
            (filteredTemplates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-text-muted">
                <FileText size={48} />
                <p className="mt-4 text-lg">{t('templates.noTemplates')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredTemplates.map((tmpl) => {
                  const status = getTemplateStatus(tmpl.id, tmpl.version)
                  return (
                    <div
                      key={tmpl.id}
                      className="flex flex-col p-4 rounded-xl border border-border-light bg-bg-card hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="p-1.5 rounded-lg bg-primary/10">
                            <FileText size={18} className="text-primary" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-medium text-text-primary truncate">{tmpl.name}</h3>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-xs px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted">
                                {tmpl.type}
                              </span>
                              <span className="text-xs font-mono text-text-muted">
                                v{tmpl.version}
                              </span>
                            </div>
                          </div>
                        </div>
                        {status === 'installed' && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-success-light text-success shrink-0">
                            {t('templates.installed')}
                          </span>
                        )}
                        {status === 'update' && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-warning-light text-warning shrink-0">
                            {t('templates.updatable')}
                          </span>
                        )}
                      </div>
                       {tmpl.description && (
                         <p className="text-xs text-text-muted mb-2 line-clamp-2">
                           {tmpl.description}
                         </p>
                       )}
                       {tmpl.createdBy && (
                         <p className="text-xs text-text-muted mb-2">
                           作者: {tmpl.createdByName || tmpl.createdBy}
                         </p>
                       )}
                       {!tmpl.visible && tmpl.createdBy === marketUser?.id && (
                         <span className="text-xs px-1.5 py-0.5 rounded bg-warning/10 text-warning mb-2 inline-block">
                           待审核
                         </span>
                       )}
                        <div className="mt-auto flex items-center justify-between">
                         <span className="text-xs text-text-muted">
                           {t('templates.downloadCount')}: {tmpl.downloadCount ?? 0}
                         </span>
                         <div className="flex items-center gap-1.5">
                           {isAdmin && (
                             <label className="flex items-center gap-1.5 cursor-pointer">
                               <span className="text-xs text-text-muted">{tmpl.visible ? '可见' : '隐藏'}</span>
                               <button
                                 onClick={() => handleToggleVisibility('template', tmpl.id, tmpl.visible)}
                                 className={`w-8 h-4 rounded-full transition-colors ${tmpl.visible ? 'bg-success' : 'bg-text-muted/40'}`}>
                                 <span className={`block w-3.5 h-3.5 rounded-full bg-white transition-transform ${tmpl.visible ? 'translate-x-4' : 'translate-x-0.5'}`} />
                               </button>
                             </label>
                           )}
                          {canDeleteItem(tmpl.createdBy) && (
                            <button onClick={() => handleDeleteTemplate(tmpl.id)}
                              className="flex items-center gap-1 px-2 py-1 rounded border border-border-light text-text-secondary text-xs hover:border-danger hover:text-danger transition-colors">
                              <Trash2 size={11} />删除
                            </button>
                          )}
                          {status !== 'none' && (
                            <button onClick={() => handleUninstallTemplate(tmpl)}
                              className="flex items-center gap-1 px-2 py-1 rounded border border-border-light text-text-secondary text-xs hover:border-danger hover:text-danger transition-colors">
                              <Trash2 size={11} />卸载
                            </button>
                          )}
                          <button onClick={() => handleInstallTemplate(tmpl)} disabled={installingId === tmpl.id}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary-hover disabled:opacity-50 transition-colors">
                            <Download size={12} />
                            {installingId === tmpl.id ? t('templates.installing') : status === 'update' ? t('templates.update') : status === 'installed' ? t('templates.reinstall') : t('templates.install')}
                          </button>
                         </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}

          {activeTab === 'scripts' &&
            (filteredScripts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-text-muted">
                <Zap size={48} />
                <p className="mt-4 text-lg">{t('templates.noScripts')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                 {filteredScripts.map((script) => {
                   const status = getScriptStatus(script.id, script.version)
                   return (
                      <div
                        key={script.id}
                        onClick={() => navigate('/marketplace/scripts/' + script.id)}
                        className="flex flex-col p-4 rounded-xl border border-border-light bg-bg-card hover:border-primary/30 transition-colors gap-2.5 cursor-pointer"
                      >
                       {/* 头部：图标 + 名称 + 版本 + 标签 + 状态徽章 */}
                       <div className="flex items-start gap-2">
                         <div className="p-1.5 rounded-lg bg-primary/10 shrink-0">
                           <Zap size={18} className="text-primary" />
                         </div>
                         <div className="min-w-0 flex-1">
                           <div className="flex items-center gap-2 flex-wrap">
                             <h3 className="font-medium text-text-primary text-sm truncate">{script.name}</h3>
                             <span className="text-xs font-mono text-text-muted shrink-0">v{script.version}</span>
                             {script.tags?.slice(0, 3).map((tag) => (
                               <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted">
                                 {tag}
                               </span>
                             ))}
                           </div>
                         </div>
                         <div className="flex items-center gap-1 shrink-0">
                           {!script.visible && script.createdBy === marketUser?.id && (
                             <span className="text-xs px-1.5 py-0.5 rounded bg-warning/10 text-warning">待审核</span>
                           )}
                           {status === 'installed' && (
                             <span className="text-xs px-1.5 py-0.5 rounded bg-success/10 text-success">{t('templates.installed')}</span>
                           )}
                           {status === 'update' && (
                             <span className="text-xs px-1.5 py-0.5 rounded bg-warning/10 text-warning">{t('templates.updatable')}</span>
                           )}
                         </div>
                       </div>

                       {/* 描述 + 作者 */}
                       {(script.description || script.createdBy) && (
                         <div className="space-y-1">
                           {script.description && (
                             <p className="text-xs text-text-muted line-clamp-2">{script.description}</p>
                           )}
                           {script.createdBy && (
                             <p className="text-xs text-text-muted">作者: {script.createdByName || script.createdBy}</p>
                           )}
                         </div>
                       )}

                        {/* 更新日志 */}
                        {script.changelog && (
                          <details className="text-xs" onClick={(e) => e.stopPropagation()}>
                            <summary className="text-text-muted cursor-pointer hover:text-text-secondary flex items-center gap-1">
                             <ChevronDown size={10} />
                             {t('templates.changelog')}
                           </summary>
                           <p className="text-text-muted mt-1 whitespace-pre-wrap">{script.changelog}</p>
                         </details>
                       )}

                       {/* 底部操作栏 */}
                       <div className="flex items-center justify-between gap-2 pt-1 border-t border-border-light/50">
                         <span className="text-xs text-text-muted shrink-0">
                           {new Date(script.updatedAt).toLocaleDateString()}
                         </span>
                         <div className="flex items-center gap-1.5 flex-wrap justify-end">
                           {isAdmin && (
                              <label className="flex items-center gap-1 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                                <span className="text-xs text-text-muted">{script.visible ? '可见' : '隐藏'}</span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleToggleVisibility('script', script.id, script.visible) }}
                                  className={`w-7 h-3.5 rounded-full transition-colors ${script.visible ? 'bg-success' : 'bg-text-muted/40'}`}
                               >
                                 <span className={`block w-3 h-3 rounded-full bg-white transition-transform ${script.visible ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                               </button>
                             </label>
                           )}
                            {canManage && (
                               <button
                                onClick={(e) => { e.stopPropagation(); handleReuploadScript(script.id) }}
                                className="flex items-center gap-1 px-2 py-1 rounded border border-border-light text-text-secondary text-xs hover:border-primary hover:text-primary transition-colors"
                              >
                                <Upload size={11} />更新
                              </button>
                            )}
                            {canDeleteItem(script.createdBy) && (
                               <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteScript(script.id) }}
                                className="flex items-center gap-1 px-2 py-1 rounded border border-border-light text-text-secondary text-xs hover:border-danger hover:text-danger transition-colors"
                              >
                                <Trash2 size={11} />删除
                              </button>
                            )}
                            {status !== 'none' && (
                               <button
                                onClick={(e) => { e.stopPropagation(); handleUninstallScript(script.id) }}
                                className="flex items-center gap-1 px-2 py-1 rounded border border-border-light text-text-secondary text-xs hover:border-danger hover:text-danger transition-colors"
                              >
                                <Trash2 size={11} />卸载
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleInstallScript(script.id) }}
                              disabled={installingId === script.id}
                             className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary-hover disabled:opacity-50 transition-colors"
                           >
                             <Download size={12} />
                             {installingId === script.id
                               ? t('templates.installing')
                               : status === 'update'
                                 ? t('templates.update')
                                 : status === 'installed'
                                   ? t('templates.reinstall')
                                   : t('templates.install')}
                           </button>
                         </div>
                       </div>
                     </div>
                   )
                 })}
              </div>
            ))}
        </>
      )}
    </div>
  )
}

export default Templates

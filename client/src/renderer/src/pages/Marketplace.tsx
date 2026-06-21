/**
 * @file Marketplace — 市场管理页面
 * @description 管理员视角的市场管理页，列出所有脚本/模板，支持查看可见性和下载量等元信息。
 * @module renderer/pages
 */

import React, { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Eye, EyeOff, Package, FileCode, Shield } from 'lucide-react'
import { marketplaceApi } from '../api'
import { useAuth } from '../contexts/AuthContext'

/** 标签页模式：脚本 / 模板 */
type TabMode = 'scripts' | 'templates'

/**
 * MarketplacePage — 市场管理页面组件
 *
 * 以表格形式展示所有脚本或模板的列表（名称、版本、下载量、可见性、更新时间）。
 * 仅 admin 角色可访问。
 */
export default function MarketplacePage(): React.ReactElement {
  const { isAdmin } = useAuth()
  const [mode, setMode] = useState<TabMode>('scripts')
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /** 根据当前标签页拉取脚本或模板列表 */
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (mode === 'scripts') {
        const data = await marketplaceApi.listScripts(undefined, 1, 9999)
        setItems(data.items as unknown as Record<string, unknown>[])
      } else {
        const data = await marketplaceApi.listTemplates(undefined, 1, 9999)
        setItems(data.items as unknown as Record<string, unknown>[])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [mode])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData()
  }, [fetchData])

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-text-muted">
        <Shield className="w-16 h-16" />
        <p>仅管理员可访问此页面</p>
      </div>
    )
  }

  const total = items.length

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 页面标题与操作栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Marketplace 管理</h1>
          <p className="text-text-muted mt-1">
            {mode === 'scripts' ? '脚本' : '模板'}管理 · 共 {total} 项
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* 脚本/模板切换与刷新 */}
          <div className="flex bg-bg-tertiary rounded-lg p-1">
            <button
              onClick={() => setMode('scripts')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mode === 'scripts' ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <FileCode className="w-4 h-4 inline mr-1.5" />脚本
            </button>
            <button
              onClick={() => setMode('templates')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mode === 'templates' ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Package className="w-4 h-4 inline mr-1.5" />模板
            </button>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-card border border-border-light rounded-lg hover:border-primary/50 transition-all text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />刷新
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/20 rounded-xl p-4 text-danger text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-bg-card rounded-xl border border-border-light p-12 text-center">
          <Package className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <p className="text-text-muted">暂无{mode === 'scripts' ? '脚本' : '模板'}</p>
        </div>
      ) : (
        <div className="bg-bg-card rounded-xl border border-border-light overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-tertiary border-b border-border-light">
                <th className="text-left px-4 py-3 font-medium text-text-muted">名称</th>
                <th className="text-left px-4 py-3 font-medium text-text-muted">版本</th>
                <th className="text-left px-4 py-3 font-medium text-text-muted">下载量</th>
                <th className="text-left px-4 py-3 font-medium text-text-muted">可见性</th>
                <th className="text-left px-4 py-3 font-medium text-text-muted">更新时间</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={String(item.id)} className="border-b border-border-light/50 hover:bg-bg-card-hover transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-text-primary">{String(item.name)}</div>
                    <div className="text-text-muted text-xs mt-0.5">{String(item.id)}</div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{String(item.version || '1.0.0')}</td>
                  <td className="px-4 py-3 text-text-secondary">{Number(item.downloads ?? 0)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${item.visible !== false ? 'bg-success/10 text-success' : 'bg-text-muted/10 text-text-muted'}`}>
                      {item.visible !== false ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      {item.visible !== false ? '可见' : '隐藏'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-muted text-xs">
                    {item.updatedAt ? new Date(String(item.updatedAt)).toLocaleString('zh-CN') : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

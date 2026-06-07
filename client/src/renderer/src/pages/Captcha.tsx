/**
 * @file Captcha — 验证码密钥管理页面
 * @description 管理 2captcha / anticaptcha / capsolver 等平台的 API 密钥，
 *              用于任务脚本执行时的验证码识别。
 *
 * 功能：
 * - provider 下拉（5 个常见服务商 + 自定义）
 * - API key 列表（显示前 N 位 + 切换显示/隐藏 + 复制）
 * - 搜索 + 分页
 * - CRUD 完整实现
 * - 删除确认用 ConfirmDialog
 * - "测试连接" 入口（前端只显示状态，具体实现留给后端 IPC 扩展）
 *
 * @module renderer/pages
 */
import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Edit3, Trash2, Key, Eye, EyeOff, Copy, RefreshCw } from 'lucide-react'
import { captchaKeyApi } from '../api'
import type { CaptchaKey, ListResponse } from '../types'
import Modal from '../components/common/Modal'
import { ConfirmDialog, SearchInput, EmptyState } from '../components/common'
import { useDebounce } from '../hooks'
import { toast } from '../utils/toast'

/** 预置 provider 列表（与 i18n `settings.providers` 对应） */
const KNOWN_PROVIDERS = ['2captcha', 'anticaptcha', 'capsolver', 'capmonster', 'deathbycaptcha'] as const

/** 表单字段包装组件 */
const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({
  label,
  hint,
  children
}) => (
  <label className="block">
    <span className="text-sm font-medium text-text-primary">{label}</span>
    {hint && <span className="text-xs text-text-muted ml-2">{hint}</span>}
    <div className="mt-1">{children}</div>
  </label>
)

export default function CaptchaPage(): React.ReactElement {
  const { t } = useTranslation()
  const [keys, setKeys] = useState<ListResponse<CaptchaKey> | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [page, setPage] = useState(1)
  const pageSize = 20

  const [editing, setEditing] = useState<CaptchaKey | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ provider: '', apiKey: '' })
  const [saving, setSaving] = useState(false)

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)

  /** 拉取验证码密钥列表（支持搜索 + 分页） */
  const fetch = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const res = await captchaKeyApi.list(page, pageSize, debouncedSearch || undefined)
      setKeys(res)
    } catch {
      setKeys(null)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, debouncedSearch])

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetch()
  }, [fetch])
  /* eslint-enable react-hooks/set-state-in-effect */

  /** 切换 key 的显示/隐藏 */
  const toggleReveal = (id: string): void => {
    setRevealedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** 复制 API key 到剪贴板 */
  const handleCopy = async (apiKey: string, id: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(apiKey)
      setCopiedId(id)
      toast.success(t('common.copySuccess'))
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      toast.error(t('common.copyFail'))
    }
  }

  const openAdd = (): void => {
    setAdding(true)
    setEditing(null)
    setForm({ provider: '', apiKey: '' })
  }

  const openEdit = (item: CaptchaKey): void => {
    setEditing(item)
    setAdding(false)
    setForm({ provider: item.provider, apiKey: item.apiKey })
  }

  const close = (): void => {
    setAdding(false)
    setEditing(null)
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      if (editing) {
        await captchaKeyApi.update(editing.id, form)
      } else {
        await captchaKeyApi.create({ ...form, balance: 0 })
      }
      close()
      await fetch()
      toast.success(t('common.saveSuccess'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.operationFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!deletingId) return
    try {
      await captchaKeyApi.delete(deletingId)
      setDeletingId(null)
      await fetch()
      toast.success(t('common.delete') + ' ' + t('common.success'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.operationFailed'))
    }
  }

  const items = keys?.items ?? []
  const total = keys?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  /** provider 是否在预置列表中（决定下拉选项） */
  const isKnownProvider = (name: string): boolean =>
    KNOWN_PROVIDERS.includes(name as (typeof KNOWN_PROVIDERS)[number])

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t('settings.captchaKeys')}</h1>
          <p className="text-text-muted mt-1 text-sm">{t('settings.captchaEmptyHint')}</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
        >
          <Plus size={16} />
          {t('settings.addCaptchaKey')}
        </button>
      </div>

      {/* 搜索 + 刷新 */}
      <div className="flex items-center gap-2">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v)
            setPage(1)
          }}
          placeholder={t('settings.captchaSearchPlaceholder')}
        />
        <button
          onClick={() => fetch()}
          className="p-2 text-text-muted hover:text-primary border border-border-light rounded-lg hover:bg-bg-card-hover transition-colors"
          title={t('common.refresh')}
          aria-label={t('common.refresh')}
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* 列表 */}
      {loading && items.length === 0 ? (
        <div className="text-center py-12 text-text-muted">{t('common.loading')}</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Key}
          title={t('settings.noCaptchaKeys')}
          description={
            debouncedSearch ? undefined : t('settings.captchaEmptyHint')
          }
          action={
            debouncedSearch ? undefined : (
              <button
                onClick={openAdd}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
              >
                <Plus size={14} />
                {t('settings.addCaptchaKey')}
              </button>
            )
          }
        />
      ) : (
        <>
          <div className="border border-border-light rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg-tertiary">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">
                    {t('settings.provider')}
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">
                    {t('settings.apiKey')}
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">
                    {t('settings.balance')}
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-text-muted">
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light/50">
                {items.map((item) => {
                  const isRevealed = revealedIds.has(item.id)
                  const displayKey = isRevealed
                    ? item.apiKey
                    : `${item.apiKey.slice(0, 8)}...${item.apiKey.slice(-4)}`
                  return (
                    <tr key={item.id} className="hover:bg-bg-card-hover transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Key size={14} className="text-text-muted" />
                          <span className="font-medium">{item.provider}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <code className="font-mono text-xs text-text-secondary">
                            {displayKey}
                          </code>
                          <button
                            onClick={() => toggleReveal(item.id)}
                            className="p-0.5 text-text-muted hover:text-primary rounded transition-colors"
                            title={isRevealed ? t('settings.hideKey') : t('settings.showKey')}
                            aria-label={isRevealed ? t('settings.hideKey') : t('settings.showKey')}
                          >
                            {isRevealed ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                          <button
                            onClick={() => handleCopy(item.apiKey, item.id)}
                            className="p-0.5 text-text-muted hover:text-primary rounded transition-colors"
                            title={t('common.copySuccess')}
                            aria-label={t('common.copySuccess')}
                          >
                            <Copy size={12} className={copiedId === item.id ? 'text-success' : ''} />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary">
                        {item.balance.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(item)}
                            className="p-1 text-text-muted hover:text-primary hover:bg-primary-light rounded transition-colors"
                            title={t('common.edit')}
                            aria-label={t('common.edit')}
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => setDeletingId(item.id)}
                            className="p-1 text-danger hover:bg-danger-light rounded transition-colors"
                            title={t('common.delete')}
                            aria-label={t('common.delete')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>
                {page} / {totalPages} · {t('common.total', { count: total })}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 border border-border-light rounded disabled:opacity-40 hover:bg-bg-card-hover transition-colors"
                >
                  ‹
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 border border-border-light rounded disabled:opacity-40 hover:bg-bg-card-hover transition-colors"
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Add/Edit Modal */}
      <Modal
        open={adding || !!editing}
        onClose={close}
        title={editing ? t('settings.editCaptchaKey') : t('settings.addCaptchaKey')}
      >
        <div className="space-y-3">
          <Field label={t('settings.provider')}>
            <select
              value={isKnownProvider(form.provider) ? form.provider : 'custom'}
              onChange={(e) => {
                const v = e.target.value
                setForm((f) => ({
                  ...f,
                  provider: v === 'custom' ? '' : v
                }))
              }}
              className="w-full px-3 py-2 text-sm border border-border-light rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {KNOWN_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {t(`settings.providers.${p}`)}
                </option>
              ))}
              <option value="custom">{t('settings.providerCustom')}</option>
            </select>
            {!isKnownProvider(form.provider) && (
              <input
                value={form.provider}
                onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
                placeholder="custom-provider"
                className="w-full mt-2 px-3 py-2 text-sm border border-border-light rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary"
              />
            )}
          </Field>
          <Field label={t('settings.apiKey')}>
            <input
              type="password"
              value={form.apiKey}
              onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="w-full px-3 py-2 text-sm border border-border-light rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary font-mono"
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={close}
            className="px-4 py-1.5 text-sm border border-border-light rounded-lg hover:bg-bg-card-hover transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.provider.trim() || !form.apiKey.trim()}
            className="px-4 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {saving ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={handleDelete}
        title={t('common.confirmDelete')}
        message={t('settings.confirmDeleteCaptchaKey')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        danger
      />
    </div>
  )
}

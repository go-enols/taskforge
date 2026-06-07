/**
 * @file Captcha — 验证码密钥管理页面
 * @description 独立的验证码密钥管理页面（P3 占位，P8 将从 Settings 完全抽出）。
 *              管理 2captcha / anticaptcha / capsolver 等平台的 API 密钥，
 *              用于任务脚本执行时的验证码识别。
 * @module renderer/pages
 */
import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Edit3, Trash2, Key, Info } from 'lucide-react'
import { captchaKeyApi } from '../api'
import type { CaptchaKey, ListResponse } from '../types'
import Modal from '../components/common/Modal'
import { toast } from '../utils/toast'

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
  const [editing, setEditing] = useState<CaptchaKey | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ provider: '', apiKey: '' })
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    try {
      setKeys(await captchaKeyApi.list())
    } catch {
      /* ignore */
    }
  }, [])

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetch()
  }, [fetch])
  /* eslint-enable react-hooks/set-state-in-effect */

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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">
            {t('nav.dataCaptcha')}
          </h1>
          <p className="text-text-muted mt-1 text-sm">
            {t('settings.security.captchaKeysHint')}
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
        >
          <Plus size={16} />
          {t('settings.addCaptchaKey')}
        </button>
      </div>

      {/* P3 placeholder note */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl border bg-blue-500/10 border-blue-500/30 text-blue-600">
        <Info className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium">P3 占位页</p>
          <p className="opacity-70 mt-0.5">
            验证码密钥管理已从设置页移至此处。P8 阶段将实现完整的数据管理面板整合。
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-text-muted">
          <Key className="w-12 h-12" />
          <p className="text-sm">{t('settings.noCaptchaKeys')}</p>
        </div>
      ) : (
        <div className="border border-border-light rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-tertiary">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-text-muted">
                  {t('settings.provider')}
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-text-muted">
                  {t('settings.apiKey')}
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-text-muted">
                  {t('settings.balance')}
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-text-muted">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light/50">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-bg-card-hover transition-colors">
                  <td className="px-4 py-2.5">{item.provider}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {item.apiKey.slice(0, 8)}...
                  </td>
                  <td className="px-4 py-2.5">{item.balance}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(item)}
                        className="p-1 text-text-muted hover:text-primary hover:bg-primary-light rounded transition-colors"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => setDeletingId(item.id)}
                        className="p-1 text-danger hover:bg-danger-light rounded transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        open={adding || !!editing}
        onClose={close}
        title={
          editing
            ? t('settings.editCaptchaKey')
            : t('settings.addCaptchaKey')
        }
      >
        <div className="space-y-3">
          <Field label={t('settings.provider')}>
            <input
              value={form.provider}
              onChange={(e) =>
                setForm((f) => ({ ...f, provider: e.target.value }))
              }
              placeholder="2captcha / anticaptcha / capsolver ..."
              className="w-full px-3 py-2 text-sm border border-border-light rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </Field>
          <Field label={t('settings.apiKey')}>
            <input
              value={form.apiKey}
              onChange={(e) =>
                setForm((f) => ({ ...f, apiKey: e.target.value }))
              }
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
            disabled={saving}
            className="px-4 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {saving ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deletingId}
        onClose={() => setDeletingId(null)}
        title={t('common.confirmDelete')}
      >
        <p className="text-sm text-text-secondary">
          {t('settings.confirmDeleteCaptchaKey')}
        </p>
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={() => setDeletingId(null)}
            className="px-4 py-1.5 text-sm border border-border-light rounded-lg hover:bg-bg-card-hover transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleDelete}
            className="px-4 py-1.5 text-sm bg-danger text-white rounded-lg hover:bg-danger/80 transition-colors"
          >
            {t('common.delete')}
          </button>
        </div>
      </Modal>
    </div>
  )
}

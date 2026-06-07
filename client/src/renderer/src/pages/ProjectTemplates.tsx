/**
 * @file ProjectTemplates — 项目模板管理页面
 * @description 用户在此创建/编辑/删除项目模板, 模板驱动 AirdropFormModal
 *              中的动态字段渲染。每个模板包含一个 fields 数组,
 *              数组元素是 ProjectTemplateField (string/number/boolean/select)。
 *
 * 设计目标: 让用户可自行扩展项目结构, 不需要改代码。
 * 内置模板不可删, 可禁用。
 *
 * @module renderer/pages
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Plus,
  Edit3,
  Trash2,
  FileBox,
  Eye,
  EyeOff,
  Power,
  PowerOff,
  ArrowUp,
  ArrowDown,
  Info,
  AlertTriangle
} from 'lucide-react'
import { projectTemplateApi } from '../api'
import type { ProjectTemplate, ProjectTemplateField } from '../../../shared/types'
import Modal from '../components/common/Modal'
import { ConfirmDialog, EmptyState } from '../components/common'
import { toast } from '../utils/toast'

/** 可用图标列表 (lucide-react 中常见的语义图标) */
const ICON_OPTIONS = [
  'Folder', 'Briefcase', 'Target', 'Rocket', 'Star', 'Flag', 'BookOpen',
  'Code', 'Database', 'Globe', 'Zap', 'Package', 'Tag', 'Bookmark'
] as const

/** 字段类型选项 (驱动模板字段类型) */
const FIELD_TYPES = ['string', 'number', 'boolean', 'select'] as const

const ProjectTemplatesPage: React.FC = () => {
  const { t } = useTranslation()
  const [templates, setTemplates] = useState<ProjectTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<ProjectTemplate | null>(null)
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState<ProjectTemplate | null>(null)

  /** 表单状态 */
  const [form, setForm] = useState({
    name: '',
    description: '',
    icon: 'Folder' as string,
    fields: [] as ProjectTemplateField[],
    enabled: true
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  /** 加载所有模板 */
  const fetch = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      setTemplates(await projectTemplateApi.list())
    } catch {
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }, [])

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetch()
  }, [fetch])
  /* eslint-enable react-hooks/set-state-in-effect */

  /** 内置模板优先, 再按 sortOrder */
  const sortedTemplates = useMemo(
    () =>
      [...templates].sort((a, b) => {
        if (a.builtIn !== b.builtIn) return a.builtIn ? -1 : 1
        return a.sortOrder - b.sortOrder
      }),
    [templates]
  )

  const openAdd = (): void => {
    setAdding(true)
    setEditing(null)
    setForm({ name: '', description: '', icon: 'Folder', fields: [], enabled: true })
    setFormError(null)
  }

  const openEdit = (tpl: ProjectTemplate): void => {
    setEditing(tpl)
    setAdding(false)
    setForm({
      name: tpl.name,
      description: tpl.description,
      icon: tpl.icon,
      fields: [...tpl.fields],
      enabled: tpl.enabled
    })
    setFormError(null)
  }

  const close = (): void => {
    setAdding(false)
    setEditing(null)
    setFormError(null)
  }

  const handleSave = async (): Promise<void> => {
    if (!form.name.trim()) {
      setFormError(t('projectTemplates.nameRequired'))
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      if (editing) {
        await projectTemplateApi.update(editing.id, {
          name: form.name.trim(),
          description: form.description.trim(),
          icon: form.icon,
          fields: form.fields,
          enabled: form.enabled
        })
      } else {
        await projectTemplateApi.create({
          name: form.name.trim(),
          description: form.description.trim(),
          icon: form.icon,
          fields: form.fields,
          builtIn: false,
          enabled: form.enabled,
          sortOrder: 100 + templates.length
        })
      }
      close()
      await fetch()
      toast.success(t('common.saveSuccess'))
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t('common.operationFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!deletingId) return
    try {
      const ok = await projectTemplateApi.delete(deletingId)
      if (!ok) {
        toast.error(t('projectTemplates.deleteBuiltinBlocked'))
      } else {
        toast.success(t('common.delete') + ' ' + t('common.success'))
      }
      setDeletingId(null)
      await fetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.operationFailed'))
    }
  }

  const handleToggleEnabled = async (tpl: ProjectTemplate): Promise<void> => {
    try {
      await projectTemplateApi.update(tpl.id, { enabled: !tpl.enabled })
      await fetch()
      toast.success(t('common.saveSuccess'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.operationFailed'))
    }
  }

  // ── 字段编辑辅助 ──
  const addField = (): void => {
    setForm((f) => ({
      ...f,
      fields: [
        ...f.fields,
        {
          name: `field_${f.fields.length + 1}`,
          title: `字段 ${f.fields.length + 1}`,
          type: 'string'
        }
      ]
    }))
  }

  const updateField = (idx: number, patch: Partial<ProjectTemplateField>): void => {
    setForm((f) => ({
      ...f,
      fields: f.fields.map((field, i) => (i === idx ? { ...field, ...patch } : field))
    }))
  }

  const removeField = (idx: number): void => {
    setForm((f) => ({
      ...f,
      fields: f.fields.filter((_, i) => i !== idx)
    }))
  }

  const moveField = (idx: number, direction: -1 | 1): void => {
    setForm((f) => {
      const next = [...f.fields]
      const target = idx + direction
      if (target < 0 || target >= next.length) return f
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return { ...f, fields: next }
    })
  }

  const parseOptions = (raw: string): Array<{ label: string; value: string }> => {
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const [label, value] = line.split('|').map((s) => s.trim())
        return { label: label || value || '', value: value || label || '' }
      })
  }

  const optionsToText = (opts: Array<{ label: string; value: string }> | undefined): string => {
    if (!opts || opts.length === 0) return ''
    return opts.map((o) => `${o.label}|${o.value}`).join('\n')
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">
            {t('projectTemplates.title')}
          </h1>
          <p className="text-text-muted mt-1 text-sm">{t('projectTemplates.subtitle')}</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
        >
          <Plus size={16} />
          {t('projectTemplates.addTemplate')}
        </button>
      </div>

      {/* 说明卡 */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl border bg-primary/5 border-primary/20 text-primary">
        <Info className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium">{t('projectTemplates.howItWorks')}</p>
          <p className="opacity-80 mt-0.5">
            {t('projectTemplates.howItWorksHint')}
          </p>
        </div>
      </div>

      {/* 列表 */}
      {loading && templates.length === 0 ? (
        <div className="text-center py-12 text-text-muted">{t('common.loading')}</div>
      ) : sortedTemplates.length === 0 ? (
        <EmptyState
          icon={FileBox}
          title={t('projectTemplates.empty')}
          description={t('projectTemplates.emptyHint')}
          action={
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
            >
              <Plus size={14} />
              {t('projectTemplates.addTemplate')}
            </button>
          }
        />
      ) : (
        <div className="space-y-2">
          {sortedTemplates.map((tpl) => (
            <div
              key={tpl.id}
              className="border border-border-light rounded-lg bg-bg-card p-4 hover:border-primary/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <FileBox size={16} className="text-text-muted" />
                    <h3 className="font-medium text-text-primary">{tpl.name}</h3>
                    {tpl.builtIn && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        {t('projectTemplate.builtIn')}
                      </span>
                    )}
                    {!tpl.enabled && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted">
                        {t('projectTemplates.disabled')}
                      </span>
                    )}
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted">
                      {tpl.fields.length} {t('projectTemplates.fields')}
                    </span>
                  </div>
                  {tpl.description && (
                    <p className="text-xs text-text-muted mt-1.5">{tpl.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setPreviewing(tpl)}
                    className="p-1.5 text-text-muted hover:text-primary hover:bg-primary-light rounded transition-colors"
                    title={t('common.preview')}
                    aria-label={t('common.preview')}
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    onClick={() => handleToggleEnabled(tpl)}
                    className="p-1.5 text-text-muted hover:text-primary hover:bg-primary-light rounded transition-colors"
                    title={tpl.enabled ? t('projectTemplates.disable') : t('projectTemplates.enable')}
                    aria-label={tpl.enabled ? t('projectTemplates.disable') : t('projectTemplates.enable')}
                  >
                    {tpl.enabled ? <Power size={14} /> : <PowerOff size={14} />}
                  </button>
                  <button
                    onClick={() => openEdit(tpl)}
                    className="p-1.5 text-text-muted hover:text-primary hover:bg-primary-light rounded transition-colors"
                    title={t('common.edit')}
                    aria-label={t('common.edit')}
                  >
                    <Edit3 size={14} />
                  </button>
                  {!tpl.builtIn && (
                    <button
                      onClick={() => setDeletingId(tpl.id)}
                      className="p-1.5 text-danger hover:bg-danger-light rounded transition-colors"
                      title={t('common.delete')}
                      aria-label={t('common.delete')}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        open={adding || !!editing}
        onClose={close}
        title={editing ? t('projectTemplates.editTemplate') : t('projectTemplates.addTemplate')}
        maxWidth="max-w-3xl"
      >
        <div className="space-y-4">
          {/* 基础信息 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-text-secondary mb-1">
                {t('projectTemplates.name')}
                <span className="text-danger ml-1">*</span>
              </label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-border-light rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                {t('projectTemplates.icon')}
              </label>
              <select
                value={form.icon}
                onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-border-light rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {ICON_OPTIONS.map((ic) => (
                  <option key={ic} value={ic}>
                    {ic}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              {t('projectTemplates.description')}
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-border-light rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary resize-y"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              className="rounded border-border-light"
            />
            <span className="text-sm text-text-primary">
              {t('projectTemplates.enabledLabel')}
            </span>
          </label>

          {/* 字段列表 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-text-secondary">
                {t('projectTemplates.fieldsLabel')}
              </label>
              <button
                type="button"
                onClick={addField}
                className="flex items-center gap-1 px-2 py-1 text-xs text-primary hover:bg-primary-light rounded transition-colors"
              >
                <Plus size={12} />
                {t('projectTemplates.addField')}
              </button>
            </div>

            {form.fields.length === 0 ? (
              <div className="text-center py-6 text-xs text-text-muted border border-dashed border-border-light rounded-lg">
                {t('projectTemplates.noFields')}
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {form.fields.map((field, idx) => (
                  <div
                    key={idx}
                    className="border border-border-light rounded-lg p-3 space-y-2 bg-bg-card"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-text-muted font-mono">
                        #{idx + 1}
                      </span>
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => moveField(idx, -1)}
                          disabled={idx === 0}
                          className="p-0.5 text-text-muted hover:text-primary disabled:opacity-30"
                          title={t('common.moveUp')}
                          aria-label={t('common.moveUp')}
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveField(idx, 1)}
                          disabled={idx === form.fields.length - 1}
                          className="p-0.5 text-text-muted hover:text-primary disabled:opacity-30"
                          title={t('common.moveDown')}
                          aria-label={t('common.moveDown')}
                        >
                          <ArrowDown size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeField(idx)}
                          className="p-0.5 text-danger hover:bg-danger-light rounded"
                          title={t('common.delete')}
                          aria-label={t('common.delete')}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        placeholder={t('projectTemplates.fieldName')}
                        value={field.name}
                        onChange={(e) =>
                          updateField(idx, {
                            name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_')
                          })
                        }
                        className="px-2 py-1.5 text-xs border border-border-light rounded bg-bg-card focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                      />
                      <input
                        placeholder={t('projectTemplates.fieldTitle')}
                        value={field.title}
                        onChange={(e) => updateField(idx, { title: e.target.value })}
                        className="px-2 py-1.5 text-xs border border-border-light rounded bg-bg-card focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <select
                        value={field.type}
                        onChange={(e) =>
                          updateField(idx, {
                            type: e.target.value as ProjectTemplateField['type']
                          })
                        }
                        className="px-2 py-1.5 text-xs border border-border-light rounded bg-bg-card focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        {FIELD_TYPES.map((ft) => (
                          <option key={ft} value={ft}>
                            {ft}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        placeholder={t('projectTemplates.fieldDefault')}
                        value={
                          field.default !== undefined
                            ? String(field.default)
                            : ''
                        }
                        onChange={(e) => {
                          const v = e.target.value
                          if (v === '') {
                            const { default: _omit, ...rest } = field
                            void _omit
                            updateField(idx, rest)
                          } else if (field.type === 'number') {
                            updateField(idx, { default: Number(v) })
                          } else if (field.type === 'boolean') {
                            updateField(idx, { default: v === 'true' })
                          } else {
                            updateField(idx, { default: v })
                          }
                        }}
                        className="px-2 py-1.5 text-xs border border-border-light rounded bg-bg-card focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <input
                        placeholder={t('projectTemplates.fieldPlaceholder')}
                        value={field.placeholder ?? ''}
                        onChange={(e) => updateField(idx, { placeholder: e.target.value })}
                        className="px-2 py-1.5 text-xs border border-border-light rounded bg-bg-card focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    {field.type === 'select' && (
                      <textarea
                        placeholder={t('projectTemplates.fieldOptionsHint')}
                        value={optionsToText(field.options)}
                        onChange={(e) =>
                          updateField(idx, { options: parseOptions(e.target.value) })
                        }
                        rows={3}
                        className="w-full px-2 py-1.5 text-xs border border-border-light rounded bg-bg-card focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                      />
                    )}
                    <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                      <input
                        type="checkbox"
                        checked={!!field.required}
                        onChange={(e) => updateField(idx, { required: e.target.checked })}
                        className="rounded border-border-light"
                      />
                      {t('projectTemplates.fieldRequired')}
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>

          {formError && (
            <div className="text-sm text-danger bg-danger-light border border-danger/30 rounded-lg px-3 py-2">
              {formError}
            </div>
          )}
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

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={handleDelete}
        title={t('common.confirmDelete')}
        message={t('projectTemplates.confirmDelete')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        danger
      />

      {/* Preview Modal */}
      <Modal
        open={!!previewing}
        onClose={() => setPreviewing(null)}
        title={t('projectTemplates.previewTitle')}
        maxWidth="max-w-md"
      >
        {previewing && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <FileBox size={16} className="text-primary" />
              <h3 className="font-medium">{previewing.name}</h3>
            </div>
            {previewing.description && (
              <p className="text-sm text-text-muted">{previewing.description}</p>
            )}
            {previewing.fields.length === 0 ? (
              <div className="text-xs text-text-muted italic">
                {t('projectTemplates.noFields')}
              </div>
            ) : (
              <div className="space-y-3 border-t border-border-light/60 pt-3">
                {previewing.fields.map((f) => (
                  <div key={f.name}>
                    <label className="block text-xs font-medium text-text-secondary mb-1">
                      {f.title}
                      {f.required && <span className="text-danger ml-1">*</span>}
                    </label>
                    {f.type === 'boolean' ? (
                      <input type="checkbox" disabled className="rounded" />
                    ) : f.type === 'select' ? (
                      <select
                        disabled
                        className="w-full px-3 py-2 text-sm border border-border-light rounded-lg bg-bg-card opacity-60"
                      >
                        {f.options?.map((o) => (
                          <option key={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : f.type === 'number' ? (
                      <input
                        type="number"
                        disabled
                        placeholder={f.placeholder}
                        className="w-full px-3 py-2 text-sm border border-border-light rounded-lg bg-bg-card opacity-60"
                      />
                    ) : (
                      <input
                        type="text"
                        disabled
                        placeholder={f.placeholder}
                        className="w-full px-3 py-2 text-sm border border-border-light rounded-lg bg-bg-card opacity-60"
                      />
                    )}
                    {f.description && (
                      <p className="text-[11px] text-text-muted mt-1">{f.description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 隐藏的 IconEye 引用避免 lint 警告 — Eye 实际上方已用 */}
      <span className="hidden" aria-hidden>
        <EyeOff size={0} />
        <AlertTriangle size={0} />
      </span>
    </div>
  )
}

export default ProjectTemplatesPage

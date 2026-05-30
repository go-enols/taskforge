import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { schedulerApi, taskTemplateApi } from '../api'
import type { ScheduledTask, TaskTemplate } from '../types'
import type { FieldMeta } from '../../../shared/schemas/task-params'
import {
  jsonSchemaToFieldMeta,
  validateFormFields,
  unflattenDotNotation
} from '../../../shared/schemas/task-params'
import { Plus, Trash2, Clock, Edit3, ToggleLeft, ToggleRight } from 'lucide-react'
import { Modal, DynamicForm } from '../components/common'

const PRESETS: { label: string; cron: string }[] = [
  { label: 'scheduler.preset30min', cron: '*/30 * * * *' },
  { label: 'scheduler.preset1hour', cron: '0 * * * *' },
  { label: 'scheduler.preset2hour', cron: '0 */2 * * *' },
  { label: 'scheduler.preset4hour', cron: '0 */4 * * *' },
  { label: 'scheduler.preset6hour', cron: '0 */6 * * *' },
  { label: 'scheduler.preset12hour', cron: '0 */12 * * *' },
  { label: 'scheduler.presetDaily', cron: '0 0 * * *' },
  { label: 'scheduler.presetCustom', cron: '' }
]

function cronDescription(expr: string, t: (k: string) => string): string {
  const preset = PRESETS.find((p) => p.cron === expr)
  if (preset && preset.cron) return t(preset.label)
  return expr
}

const Scheduler: React.FC = () => {
  const { t } = useTranslation()
  const [items, setItems] = useState<ScheduledTask[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ templateId: '', presetIdx: 0, customCron: '' })
  const [creating, setCreating] = useState(false)
  const [editingItem, setEditingItem] = useState<ScheduledTask | null>(null)
  const [editForm, setEditForm] = useState({ presetIdx: 0, customCron: '' })
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [taskTemplates, setTaskTemplates] = useState<TaskTemplate[]>([])
  const [formFields, setFormFields] = useState<FieldMeta[]>([])
  const [formValues, setFormValues] = useState<Record<string, unknown>>({})

  useEffect(() => {
    taskTemplateApi
      .list(1, 999)
      .then((res) => setTaskTemplates(res.items || []))
      .catch(() => setError(t('common.error')))
  }, [])

  const getTemplateName = (id: string): string =>
    taskTemplates.find((tt) => tt.id === id)?.name || id

  const getCronExpression = (presetIdx: number, custom: string): string => {
    if (presetIdx === PRESETS.length - 1) return custom.trim()
    return PRESETS[presetIdx]?.cron || ''
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await schedulerApi.list()
      setItems(res.items || [])
    } catch {
      setItems([])
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleScriptChange = (id: string): void => {
    setForm((f) => ({ ...f, templateId: id }))
    setFormValues({})
    if (!id) {
      setFormFields([])
      return
    }
    const tt = taskTemplates.find((t) => t.id === id)
    if (tt?.manifest?.schema) {
      try {
        const schema = tt.manifest.schema as Record<string, unknown>
        if (schema.type === 'object' && schema.properties) {
          const fields = jsonSchemaToFieldMeta(schema)
          setFormFields(fields)
          const defaults: Record<string, unknown> = {}
          for (const f of fields) {
            if (f.defaultValue !== undefined) defaults[f.name] = f.defaultValue
          }
          setFormValues(defaults)
        } else {
          setFormFields([])
        }
      } catch {
        setFormFields([])
      }
    } else {
      setFormFields([])
    }
  }

  const handleCreate = async (): Promise<void> => {
    const cronExpr = getCronExpression(form.presetIdx, form.customCron)
    if (!form.templateId.trim() || !cronExpr) return
    if (formFields.length > 0) {
      const errors = validateFormFields(formFields, formValues)
      if (Object.keys(errors).length > 0) {
        return
      }
    }
    setCreating(true)
    setError(null)
    try {
      const rawConfig = formFields.length > 0 ? formValues : {}
      const config = unflattenDotNotation(rawConfig)
      await schedulerApi.create({
        templateId: form.templateId.trim(),
        config,
        cronExpression: cronExpr,
        enabled: true,
        lastRun: null,
        nextRun: null
      })
      setShowCreate(false)
      setForm({ templateId: '', presetIdx: 0, customCron: '' })
      setFormFields([])
      setFormValues({})
      fetchData()
    } catch {
      setError(t('common.error'))
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string): Promise<void> => {
    if (!window.confirm(t('scheduler.confirmDelete'))) return
    try {
      await schedulerApi.delete(id)
      fetchData()
    } catch {
      setError(t('common.error'))
    }
  }

  const handleToggle = async (item: ScheduledTask): Promise<void> => {
    setTogglingId(item.id)
    setError(null)
    try {
      await schedulerApi.update(item.id, { enabled: !item.enabled })
      fetchData()
    } catch {
      setError(t('common.error'))
    } finally {
      setTogglingId(null)
    }
  }

  const openEdit = (item: ScheduledTask): void => {
    setEditingItem(item)
    const presetIdx = PRESETS.findIndex((p) => p.cron === item.cronExpression)
    setEditForm({
      presetIdx: presetIdx >= 0 ? presetIdx : PRESETS.length - 1,
      customCron: presetIdx >= 0 ? '' : item.cronExpression
    })
    setEditError(null)
  }

  const handleEdit = async (): Promise<void> => {
    if (!editingItem) return
    const cronExpr = getCronExpression(editForm.presetIdx, editForm.customCron)
    if (!cronExpr) return
    setSaving(true)
    setEditError(null)
    try {
      await schedulerApi.update(editingItem.id, { cronExpression: cronExpr })
      setEditingItem(null)
      fetchData()
    } catch {
      setEditError(t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  const formatTime = (time: string | null): string => {
    if (!time) return '—'
    return new Date(time).toLocaleString()
  }

  const isCustom = (idx: number): boolean => idx === PRESETS.length - 1

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('scheduler.title')}</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-hover transition-colors"
        >
          <Plus size={16} />
          {t('scheduler.createSchedule')}
        </button>
      </div>

      {error && (
        <div className="text-danger text-sm bg-danger-light border border-danger/30 rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-text-muted">
          <span>{t('common.loading')}</span>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-text-muted">
          <Clock size={48} />
          <p className="mt-4 text-lg">{t('scheduler.noSchedules')}</p>
        </div>
      ) : (
        <div className="bg-bg-card rounded-xl border border-border-light overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-light bg-bg-tertiary">
                <th className="text-left px-4 py-3 font-medium text-text-secondary">
                  {t('scheduler.scriptName')}
                </th>
                <th className="text-left px-4 py-3 font-medium text-text-secondary">
                  {t('scheduler.interval')}
                </th>
                <th className="text-left px-4 py-3 font-medium text-text-secondary">
                  {t('scheduler.enabled')}
                </th>
                <th className="text-left px-4 py-3 font-medium text-text-secondary">
                  {t('scheduler.lastRun')}
                </th>
                <th className="text-left px-4 py-3 font-medium text-text-secondary">
                  {t('scheduler.nextRun')}
                </th>
                <th className="text-right px-4 py-3 font-medium text-text-secondary">
                  {t('scheduler.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-border-light hover:bg-bg-tertiary transition-colors"
                >
                  <td className="px-4 py-3 text-xs">{getTemplateName(item.templateId)}</td>
                  <td className="px-4 py-3 text-xs text-text-muted font-mono">
                    {cronDescription(item.cronExpression, t)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(item)}
                      disabled={togglingId === item.id}
                      className="flex items-center gap-1.5 group"
                    >
                      {item.enabled ? (
                        <>
                          <ToggleRight
                            size={20}
                            className="text-success group-hover:text-success transition-colors"
                          />
                          <span className="text-xs font-medium text-success">
                            {t('scheduler.enabledTrue')}
                          </span>
                        </>
                      ) : (
                        <>
                          <ToggleLeft
                            size={20}
                            className="text-text-muted group-hover:text-text-secondary transition-colors"
                          />
                          <span className="text-xs font-medium text-text-muted">
                            {t('scheduler.disabled')}
                          </span>
                        </>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted">{formatTime(item.lastRun)}</td>
                  <td className="px-4 py-3 text-xs text-text-muted">{formatTime(item.nextRun)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(item)}
                        className="p-1.5 text-text-muted hover:text-primary rounded"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-1.5 text-text-muted hover:text-danger rounded"
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

      <Modal
        open={showCreate}
        onClose={() => {
          setShowCreate(false)
          setForm({ templateId: '', presetIdx: 0, customCron: '' })
          setFormFields([])
          setFormValues({})
        }}
        title={t('scheduler.createSchedule')}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              {t('scheduler.selectScript')}
            </label>
            <select
              value={form.templateId}
              onChange={(e) => handleScriptChange(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border-light rounded-lg bg-bg-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">{t('scheduler.selectScriptPlaceholder')}</option>
              {taskTemplates.map((tt) => (
                <option key={tt.id} value={tt.id}>
                  {tt.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              {t('scheduler.interval')}
            </label>
            <select
              value={form.presetIdx}
              onChange={(e) =>
                setForm((f) => ({ ...f, presetIdx: Number(e.target.value), customCron: '' }))
              }
              className="w-full px-3 py-2 text-sm border border-border-light rounded-lg bg-bg-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {PRESETS.map((p, i) => (
                <option key={i} value={i}>
                  {t(p.label)}
                </option>
              ))}
            </select>
          </div>
          {isCustom(form.presetIdx) && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                {t('scheduler.customCron')}
              </label>
              <input
                type="text"
                value={form.customCron}
                onChange={(e) => setForm((f) => ({ ...f, customCron: e.target.value }))}
                placeholder="0 */6 * * *"
                className="w-full px-3 py-2 text-sm border border-border-light rounded-lg font-mono bg-bg-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-xs text-text-muted mt-1">{t('scheduler.cronHint')}</p>
            </div>
          )}
          {formFields.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('tasks.config')}
              </label>
              <DynamicForm
                fields={formFields}
                defaultValues={formValues}
                onSubmit={(values) => {
                  setFormValues(values)
                }}
                submitLabel="验证"
              />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={() => setShowCreate(false)}
            className="px-4 py-2 text-sm text-text-secondary hover:bg-bg-tertiary rounded-lg transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleCreate}
            disabled={
              creating ||
              !form.templateId.trim() ||
              (isCustom(form.presetIdx) && !form.customCron.trim())
            }
            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {t('common.create')}
          </button>
        </div>
      </Modal>

      <Modal
        open={!!editingItem}
        onClose={() => {
          setEditingItem(null)
          setEditForm({ presetIdx: 0, customCron: '' })
          setEditError(null)
        }}
        title={t('scheduler.editSchedule')}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              {t('scheduler.scriptName')}
            </label>
            <input
              type="text"
              value={editingItem ? getTemplateName(editingItem.templateId) : ''}
              disabled
              className="w-full px-3 py-2 text-sm border border-border-light rounded-lg bg-bg-tertiary text-text-muted"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              {t('scheduler.interval')}
            </label>
            <select
              value={editForm.presetIdx}
              onChange={(e) =>
                setEditForm((f) => ({
                  ...f,
                  presetIdx: Number(e.target.value),
                  customCron: ''
                }))
              }
              className="w-full px-3 py-2 text-sm border border-border-light rounded-lg bg-bg-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {PRESETS.map((p, i) => (
                <option key={i} value={i}>
                  {t(p.label)}
                </option>
              ))}
            </select>
          </div>
          {isCustom(editForm.presetIdx) && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                {t('scheduler.customCron')}
              </label>
              <input
                type="text"
                value={editForm.customCron}
                onChange={(e) => setEditForm((f) => ({ ...f, customCron: e.target.value }))}
                placeholder="0 */6 * * *"
                className="w-full px-3 py-2 text-sm border border-border-light rounded-lg font-mono bg-bg-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-xs text-text-muted mt-1">{t('scheduler.cronHint')}</p>
            </div>
          )}
        </div>
        {editError && <div className="text-danger text-sm mt-3">{editError}</div>}
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={() => setEditingItem(null)}
            className="px-4 py-2 text-sm text-text-secondary hover:bg-bg-tertiary rounded-lg transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleEdit}
            disabled={saving || (isCustom(editForm.presetIdx) && !editForm.customCron.trim())}
            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {t('common.save')}
          </button>
        </div>
      </Modal>
    </div>
  )
}

export default Scheduler

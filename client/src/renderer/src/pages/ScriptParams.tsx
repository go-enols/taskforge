/**
 * @file ScriptParams — 脚本参数管理页
 * @description 管理参数池中的脚本参数（任务脚本的输入数据），支持创建（基于模板动态表单）、编辑、
 *              批量 JSON 导入、文件导入、导出和删除操作。
 * @module renderer/pages
 */

import { useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from '../utils/toast'
import { scriptParamApi, dialogApi, templateApi } from '../api'
import type { ScriptParam } from '../types'
import { Plus, Trash2, Edit3, Search, Upload, Download, FileDown } from 'lucide-react'
import { parseScriptParamImport } from '../utils/script-param-import'
import type { ParsedScriptParam, ParseError } from '../utils/script-param-import'
import { usePaginatedList, useTemplateList } from '../hooks'
import { Pagination, SearchInput, Modal, ConfirmDialog } from '../components/common'
import DynamicForm from '../components/DynamicForm'
import { jsonSchemaToFieldMeta } from '../../../shared/schemas/task-params'

/** 每页显示的账户数 */
const PAGE_SIZE = 10

/**
 * ScriptParams — 脚本参数管理页面组件
 *
 * 提供分页列表、搜索、按模板动态表单创建脚本参数、批量 JSON 导入、文件导入和导出功能。
 */
const ScriptParams: React.FC = () => {
  const { t } = useTranslation()
  const { templates } = useTemplateList()
  const {
    items,
    total,
    page,
    totalPages,
    loading,
    error,
    setPage,
    setSearch,
    search,
    refresh: fetchData
  } = usePaginatedList<ScriptParam>((p, ps, s) => scriptParamApi.list(p, ps, s), PAGE_SIZE)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    templateId: '',
    pool: '',
    notes: '',
    labels: '',
    data: '{}',
    dynamicFormValues: {} as Record<string, unknown>
  })
  const [creating, setCreating] = useState(false)
  const [editingItem, setEditingItem] = useState<ScriptParam | null>(null)
  const [editForm, setEditForm] = useState({ pool: '', notes: '', labels: '', data: '{}' })
  const [editDynamicFormValues, setEditDynamicFormValues] = useState<Record<string, unknown>>({})
  const [dataTab, setDataTab] = useState<'form' | 'json'>('form')
  const [editDataTab, setEditDataTab] = useState<'form' | 'json'>('json')
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [showBatchImport, setShowBatchImport] = useState(false)
  const [batchJson, setBatchJson] = useState('')
  const [batchError, setBatchError] = useState<string | null>(null)
  const [showImportPreview, setShowImportPreview] = useState(false)
  const [importValid, setImportValid] = useState<ParsedScriptParam[]>([])
  const [importErrors, setImportErrors] = useState<ParseError[]>([])
  const [importing, setImporting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [showPoolConfirm, setShowPoolConfirm] = useState(false)
  const pendingCreateRef = useRef<Record<string, unknown> | null>(null)

  const handleExport = useCallback(async () => {
    try {
      const resp = await scriptParamApi.list(1, 9999)
      const exportData = resp.items.map((item) => ({
        templateId: item.templateId,
        data: item.data,
        pool: item.pool,
        labels: item.labels,
        notes: item.notes
      }))
      const json = JSON.stringify(exportData, null, 2)
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const result = await dialogApi.saveFile(`script-params-${date}.json`, json)
      if (!result.canceled && result.filePath) {
        toast.success(t('scriptParams.exportSuccess'))
      }
    } catch {
      toast.error(t('scriptParams.exportFailed'))
    }
  }, [t])

  const handleBatchImport = useCallback(async () => {
    setBatchError(null)
    let parsed: Array<{
      templateId?: string
      data?: Record<string, unknown>
      pool?: string
      labels?: string[]
      notes?: string
    }>
    try {
      parsed = JSON.parse(batchJson)
      if (!Array.isArray(parsed)) {
        setBatchError(t('scriptParams.batchImportInvalidArray'))
        return
      }
    } catch {
      setBatchError(t('common.invalidJson'))
      return
    }
    const items = parsed.map((item) => ({
      templateId: item.templateId || '',
      data: item.data || {},
      pool: item.pool || '',
      labels: item.labels || [],
      notes: item.notes || ''
    }))
    try {
      const count = await scriptParamApi.batchCreate(items)
      setShowBatchImport(false)
      setBatchJson('')
      toast.success(t('scriptParams.batchImportSuccess', { count }))
      fetchData()
    } catch {
      setBatchError(t('common.operationFailed'))
    }
  }, [batchJson, t, fetchData])

  const handleFileImport = useCallback(async () => {
    try {
      const result = await dialogApi.openFile([{ name: 'JSON', extensions: ['json'] }])
      if (result.canceled || !result.content) return

      const templatesResp = await templateApi.list(1, 9999)
      const { valid, errors } = parseScriptParamImport(result.content, templatesResp.items)
      setImportValid(valid)
      setImportErrors(errors)
      setShowImportPreview(true)
    } catch {
      toast.error(t('common.operationFailed'))
    }
  }, [t])

  const handleConfirmImport = useCallback(async () => {
    if (importValid.length === 0) return
    setImporting(true)
    try {
      const count = await scriptParamApi.batchCreate(importValid)
      setShowImportPreview(false)
      setImportValid([])
      setImportErrors([])
      toast.success(t('scriptParams.importSucceeded', { count }))
      fetchData()
    } catch {
      toast.error(t('common.operationFailed'))
    } finally {
      setImporting(false)
    }
  }, [importValid, t, fetchData])

  const doCreateScriptParam = useCallback(
    async (parsedData: Record<string, unknown>) => {
      setCreating(true)
      setCreateError(null)
      try {
        await scriptParamApi.create({
          templateId: form.templateId.trim(),
          data: parsedData,
          pool: form.pool.trim(),
          labels: form.labels
            ? form.labels
                .split(',')
                .map((l) => l.trim())
                .filter(Boolean)
            : [],
          notes: form.notes.trim()
        })
        setShowCreate(false)
        setForm({
          templateId: '',
          pool: '',
          notes: '',
          labels: '',
          data: '{}',
          dynamicFormValues: {}
        })
        fetchData()
      } catch {
        setCreateError(t('common.error'))
      } finally {
        setCreating(false)
      }
    },
    [form, t, fetchData]
  )

  const handleCreate = useCallback(async () => {
    if (!form.templateId.trim() || !form.pool.trim()) return
    // 使用 DynamicForm 的值或手写 JSON
    const selectedTemplate = templates.find((t) => t.id === form.templateId)
    let parsedData: Record<string, unknown> = {}
    const createHasSchema = selectedTemplate?.schema && Object.keys(selectedTemplate.schema).length > 0
    if (createHasSchema && dataTab === 'form') {
      parsedData = { ...form.dynamicFormValues }
    } else {
      try {
        parsedData = JSON.parse(form.data || '{}')
      } catch {
        setCreateError(t('common.invalidJson'))
        return
      }
    }
    // 检查账号池是否存在
    try {
      const pools = await scriptParamApi.listPools()
      const poolName = form.pool.trim()
      if (!pools.includes(poolName)) {
        pendingCreateRef.current = parsedData
        setShowPoolConfirm(true)
        return
      }
    } catch {
      console.warn('Pool check failed, proceeding anyway')
    }
    doCreateScriptParam(parsedData)
  }, [form, dataTab, t, templates, doCreateScriptParam])

  const handlePoolConfirm = useCallback(async () => {
    setShowPoolConfirm(false)
    if (pendingCreateRef.current) {
      const data = pendingCreateRef.current
      pendingCreateRef.current = null
      await doCreateScriptParam(data)
    }
  }, [doCreateScriptParam])

  const handleDelete = useCallback(
    (id: string): void => {
      setDeleteTarget(id)
      setShowDeleteConfirm(true)
    },
    []
  )

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    setShowDeleteConfirm(false)
    try {
      await scriptParamApi.delete(deleteTarget)
      fetchData()
    } catch {
      toast.error(t('common.operationFailed'))
    } finally {
      setDeleteTarget(null)
    }
  }, [deleteTarget, t, fetchData])

  const openEdit = (item: ScriptParam): void => {
    setEditingItem(item)
    setEditForm({
      pool: item.pool,
      notes: item.notes,
      labels: item.labels.join(', '),
      data: JSON.stringify(item.data, null, 2)
    })
    setEditDynamicFormValues(item.data as Record<string, unknown>)
    setEditError(null)
    // Default to form tab if the item's template has a schema
    const tpl = templates.find((t) => t.id === item.templateId)
    setEditDataTab(tpl?.schema && Object.keys(tpl.schema).length > 0 ? 'form' : 'json')
  }

  const handleEdit = useCallback(async () => {
    if (!editingItem) return
    let parsedData: Record<string, unknown> = {}
    const editTpl = templates.find((t) => t.id === editingItem.templateId)
    const editHasSchema = editTpl?.schema && Object.keys(editTpl.schema).length > 0
    if (editHasSchema && editDataTab === 'form') {
      parsedData = { ...editDynamicFormValues }
    } else {
      try {
        parsedData = JSON.parse(editForm.data || '{}')
      } catch {
        setEditError(t('common.invalidJson'))
        return
      }
    }
    setSaving(true)
    setEditError(null)
    try {
      await scriptParamApi.update(editingItem.id, {
        pool: editForm.pool.trim(),
        notes: editForm.notes.trim(),
        labels: editForm.labels
          ? editForm.labels
              .split(',')
              .map((l) => l.trim())
              .filter(Boolean)
          : [],
        data: parsedData
      })
      setEditingItem(null)
      fetchData()
    } catch {
      setEditError(t('common.error'))
    } finally {
      setSaving(false)
    }
  }, [editingItem, editForm, editDynamicFormValues, editDataTab, templates, t, fetchData])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('scriptParams.title')}</h1>
        <div className="flex items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('scriptParams.searchPlaceholder')}
          />
          <button
            onClick={() => setShowBatchImport(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-text-secondary bg-bg-tertiary rounded-lg hover:bg-bg-card-hover transition-colors"
          >
            <Upload size={16} />
            {t('scriptParams.batchImport')}
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-text-secondary bg-bg-tertiary rounded-lg hover:bg-bg-card-hover transition-colors"
          >
            <Download size={16} />
            {t('scriptParams.export')}
          </button>
          <button
            onClick={handleFileImport}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-text-secondary bg-bg-tertiary rounded-lg hover:bg-bg-card-hover transition-colors"
          >
            <FileDown size={16} />
            {t('scriptParams.importFile')}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-hover transition-colors"
          >
            <Plus size={16} />
            {t('scriptParams.create')}
          </button>
        </div>
      </div>

      {(error || createError) && (
        <div className="text-danger text-sm bg-danger-light border border-danger/30 rounded-lg px-4 py-2">
          {createError || t('common.error')}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-text-muted">
          <span>{t('common.loading')}</span>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-text-muted">
          <Search size={48} />
          <p className="mt-4 text-lg">{t('scriptParams.empty')}</p>
        </div>
      ) : (
        <>
          <div className="bg-bg-card rounded-xl border border-border-light overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-light bg-bg-tertiary">
                  <th className="text-left px-4 py-3 font-medium text-text-secondary">
                    {t('scriptParams.templateId')}
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-text-secondary">
                    {t('scriptParams.pool')}
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-text-secondary">
                    {t('scriptParams.labels')}
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-text-secondary">
                    {t('scriptParams.notes')}
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-text-secondary">
                    {t('scriptParams.createdAt')}
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-text-secondary">
                    {t('scriptParams.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-border-light hover:bg-bg-tertiary transition-colors"
                  >
                    <td className="px-4 py-3 text-xs">
                      {templates.find((t) => t.id === item.templateId)?.name ||
                        t('scriptParams.unknownTemplate')}
                    </td>
                    <td className="px-4 py-3">{item.pool}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {item.labels.length > 0 ? (
                          item.labels.map((l, i) => (
                            <span
                              key={i}
                              className="inline-block px-2 py-0.5 text-xs bg-primary-light text-primary rounded-full"
                            >
                              {l}
                            </span>
                          ))
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-[200px] truncate text-text-muted">
                      {item.notes || '—'}
                    </td>
                    <td className="px-4 py-3 text-text-muted text-xs">
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(item)}
                          className="p-1.5 text-text-muted hover:text-primary hover:bg-primary-light rounded-lg transition-colors"
                          aria-label={t('common.edit')}
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="p-1.5 text-text-muted hover:text-danger hover:bg-danger-light rounded-lg transition-colors"
                          aria-label={t('common.delete')}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
            totalCountText={t('common.total', { count: total })}
            pageText={t('common.page', { current: page, total: totalPages })}
          />
        </>
      )}

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title={t('scriptParams.create')}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              {t('scriptParams.templateId')}
            </label>
            <select
              value={form.templateId}
              onChange={(e) => {
                const tid = e.target.value
                const tpl = templates.find((t) => t.id === tid)
                const hasSchema = tpl?.schema && Object.keys(tpl.schema).length > 0
                setDataTab(hasSchema ? 'form' : 'json')
                setForm((f) => ({ ...f, templateId: tid, dynamicFormValues: {}, data: '{}' }))
              }}
              className="w-full px-3 py-2 text-sm border border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">{t('scriptParams.selectTemplate')}</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.type})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              {t('scriptParams.pool')}
            </label>
            <input
              type="text"
              value={form.pool}
              onChange={(e) => setForm((f) => ({ ...f, pool: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              {t('scriptParams.labels')}
            </label>
            <input
              type="text"
              value={form.labels}
              onChange={(e) => setForm((f) => ({ ...f, labels: e.target.value }))}
              placeholder={t('scriptParams.labelsPlaceholder')}
              className="w-full px-3 py-2 text-sm border border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              {t('scriptParams.notes')}
            </label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          {(() => {
            const selectedTpl = templates.find((t) => t.id === form.templateId)
            const hasSchema = selectedTpl?.schema && Object.keys(selectedTpl.schema).length > 0
            const fields = hasSchema ? jsonSchemaToFieldMeta(selectedTpl!.schema) : []
            const currentTab = hasSchema ? dataTab : 'json'
            return (
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  {t('scriptParams.data')}
                </label>
                {hasSchema && (
                  <div className="flex gap-1 mb-2">
                    <button
                      type="button"
                      onClick={() => {
                        // Sync form → JSON when switching to json tab
                        if (dataTab === 'form') {
                          setForm((f) => ({
                            ...f,
                            data: JSON.stringify(f.dynamicFormValues, null, 2)
                          }))
                        }
                        setDataTab('json')
                      }}
                      className={`px-3 py-1 text-xs rounded-md transition-colors ${currentTab === 'json' ? 'bg-primary text-white' : 'bg-bg-tertiary text-text-secondary hover:bg-bg-card-hover'}`}
                    >
                      {t('scriptParams.jsonTab')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        // Sync JSON → form when switching to form tab
                        if (dataTab === 'json') {
                          try {
                            const parsed = JSON.parse(form.data || '{}')
                            setForm((f) => ({ ...f, dynamicFormValues: parsed }))
                          } catch { /* keep existing */ }
                        }
                        setDataTab('form')
                      }}
                      className={`px-3 py-1 text-xs rounded-md transition-colors ${currentTab === 'form' ? 'bg-primary text-white' : 'bg-bg-tertiary text-text-secondary hover:bg-bg-card-hover'}`}
                    >
                      {t('scriptParams.formTab')}
                    </button>
                  </div>
                )}
                {currentTab === 'form' && fields.length > 0 ? (
                  <DynamicForm
                    fields={fields}
                    defaultValues={form.dynamicFormValues}
                    onSubmit={(values) => setForm((f) => ({ ...f, dynamicFormValues: values }))}
                    submitLabel={t('common.save')}
                  />
                ) : (
                  <textarea
                    value={form.data}
                    onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
                    rows={4}
                    className="w-full px-3 py-2 text-sm border border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono resize-none"
                  />
                )}
              </div>
            )
          })()}
        </div>
        {createError && <div className="text-danger text-sm mt-3">{createError}</div>}
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={() => {
              setShowCreate(false)
              setCreateError(null)
            }}
            className="px-4 py-2 text-sm text-text-secondary hover:bg-bg-tertiary rounded-lg transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !form.templateId.trim() || !form.pool.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {t('common.create')}
          </button>
        </div>
      </Modal>

      <Modal
        open={!!editingItem}
        onClose={() => setEditingItem(null)}
        title={t('scriptParams.edit')}
        scrollable
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              {t('scriptParams.pool')}
            </label>
            <input
              type="text"
              value={editForm.pool}
              onChange={(e) => setEditForm((f) => ({ ...f, pool: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              {t('scriptParams.labels')}
            </label>
            <input
              type="text"
              value={editForm.labels}
              onChange={(e) => setEditForm((f) => ({ ...f, labels: e.target.value }))}
              placeholder={t('scriptParams.labelsPlaceholder')}
              className="w-full px-3 py-2 text-sm border border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              {t('scriptParams.notes')}
            </label>
            <input
              type="text"
              value={editForm.notes}
              onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          {(() => {
            const editTpl = editingItem
              ? templates.find((t) => t.id === editingItem.templateId)
              : null
            const editHasSchema = editTpl?.schema && Object.keys(editTpl.schema).length > 0
            const editFields = editHasSchema ? jsonSchemaToFieldMeta(editTpl!.schema) : []
            const currentEditTab = editHasSchema ? editDataTab : 'json'
            return (
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  {t('scriptParams.data')}
                </label>
                {editHasSchema && (
                  <div className="flex gap-1 mb-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (editDataTab === 'form') {
                          setEditForm((f) => ({
                            ...f,
                            data: JSON.stringify(editDynamicFormValues, null, 2)
                          }))
                        }
                        setEditDataTab('json')
                      }}
                      className={`px-3 py-1 text-xs rounded-md transition-colors ${currentEditTab === 'json' ? 'bg-primary text-white' : 'bg-bg-tertiary text-text-secondary hover:bg-bg-card-hover'}`}
                    >
                      {t('scriptParams.jsonTab')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (editDataTab === 'json') {
                          try {
                            const parsed = JSON.parse(editForm.data || '{}')
                            setEditDynamicFormValues(parsed)
                          } catch { /* keep existing */ }
                        }
                        setEditDataTab('form')
                      }}
                      className={`px-3 py-1 text-xs rounded-md transition-colors ${currentEditTab === 'form' ? 'bg-primary text-white' : 'bg-bg-tertiary text-text-secondary hover:bg-bg-card-hover'}`}
                    >
                      {t('scriptParams.formTab')}
                    </button>
                  </div>
                )}
                {currentEditTab === 'form' && editFields.length > 0 ? (
                  <DynamicForm
                    fields={editFields}
                    defaultValues={editDynamicFormValues}
                    onSubmit={(values) => setEditDynamicFormValues(values)}
                    submitLabel={t('common.save')}
                  />
                ) : (
                  <textarea
                    value={editForm.data}
                    onChange={(e) => setEditForm((f) => ({ ...f, data: e.target.value }))}
                    rows={6}
                    className="w-full px-3 py-2 text-sm border border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono resize-none"
                  />
                )}
              </div>
            )
          })()}
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
            disabled={saving || !editForm.pool.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {t('common.save')}
          </button>
        </div>
      </Modal>

      <Modal
        open={showBatchImport}
        onClose={() => {
          setShowBatchImport(false)
          setBatchError(null)
        }}
        title={t('scriptParams.batchImportTitle')}
        scrollable
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              {t('scriptParams.batchImportLabel')}
            </label>
            <textarea
              value={batchJson}
              onChange={(e) => setBatchJson(e.target.value)}
              rows={12}
              placeholder={`[
  { "templateId": "<your-template-id>", "pool": "my-pool", "data": { "address": "...", "privateKey": "..." } },
  { "templateId": "<your-template-id>", "pool": "my-pool", "data": { "address": "...", "privateKey": "..." } }
]`}
              className="w-full px-3 py-2 text-sm border border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono resize-none"
            />
          </div>
        </div>
        {batchError && <div className="text-danger text-sm mt-3">{batchError}</div>}
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={() => {
              setShowBatchImport(false)
              setBatchError(null)
            }}
            className="px-4 py-2 text-sm text-text-secondary hover:bg-bg-tertiary rounded-lg transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleBatchImport}
            disabled={!batchJson.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {t('scriptParams.batchImportDoImport')}
          </button>
        </div>
      </Modal>

      <Modal
        open={showImportPreview}
        onClose={() => {
          setShowImportPreview(false)
          setImportValid([])
          setImportErrors([])
        }}
        title={t('scriptParams.importPreview')}
        scrollable
      >
        <div className="space-y-4">
          {importErrors.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-amber-700 mb-2">
                {t('scriptParams.importValidationError')}
              </h4>
              <div className="max-h-32 overflow-y-auto bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1">
                {importErrors.map((err, i) => (
                  <div key={i}>
                    行 {err.row}: {err.message}
                  </div>
                ))}
              </div>
            </div>
          )}

          {importValid.length > 0 && (
            <div>
              <div className="text-sm text-text-muted mb-3">
                {t('scriptParams.parsedCount', {
                  valid: importValid.length,
                  error: importErrors.length
                })}
              </div>

              <div className="border border-border-light rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-bg-tertiary border-b border-border-light">
                      <th className="text-left px-3 py-2 font-medium text-text-secondary">
                        {t('scriptParams.templateId')}
                      </th>
                      <th className="text-left px-3 py-2 font-medium text-text-secondary">
                        {t('scriptParams.pool')}
                      </th>
                      <th className="text-left px-3 py-2 font-medium text-text-secondary">
                        {t('scriptParams.labels')}
                      </th>
                      <th className="text-left px-3 py-2 font-medium text-text-secondary">
                        {t('scriptParams.notes')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {importValid.slice(0, 5).map((item, i) => (
                      <tr key={i} className="border-b border-border-light last:border-b-0">
                        <td className="px-3 py-2 font-mono">{item.templateId || '—'}</td>
                        <td className="px-3 py-2">{item.pool}</td>
                        <td className="px-3 py-2">
                          {item.labels.length > 0 ? item.labels.join(', ') : '—'}
                        </td>
                        <td className="px-3 py-2 max-w-[150px] truncate">{item.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {importValid.length > 5 && (
                <p className="text-xs text-text-muted mt-2">...还有 {importValid.length - 5} 条</p>
              )}
            </div>
          )}

          {importValid.length === 0 && importErrors.length === 0 && (
            <div className="text-sm text-text-muted py-4 text-center">{t('common.noData')}</div>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={() => {
              setShowImportPreview(false)
              setImportValid([])
              setImportErrors([])
            }}
            className="px-4 py-2 text-sm text-text-secondary hover:bg-bg-tertiary rounded-lg transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleConfirmImport}
            disabled={importing || importValid.length === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {importing ? t('common.loading') : t('common.import')}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false)
          setDeleteTarget(null)
        }}
        onConfirm={handleConfirmDelete}
        title={t('scriptParams.confirmDelete')}
        message={t('scriptParams.confirmDelete')}
        confirmText={t('common.confirm')}
        cancelText={t('common.cancel')}
      />

      <ConfirmDialog
        open={showPoolConfirm}
        onClose={() => {
          setShowPoolConfirm(false)
          pendingCreateRef.current = null
        }}
        onConfirm={handlePoolConfirm}
        title={t('scriptParams.poolNotExistConfirm', { name: form.pool })}
        message={t('scriptParams.poolNotExistConfirm', { name: form.pool })}
        danger={false}
        confirmText={t('common.confirm')}
        cancelText={t('common.cancel')}
      />
    </div>
  )
}

export default ScriptParams

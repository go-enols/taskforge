import { useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from '../utils/toast'
import { accountApi, dialogApi, templateApi } from '../api'
import type { Account } from '../types'
import { Plus, Trash2, Edit3, Search, Upload, Download, FileDown } from 'lucide-react'
import { parseAccountImport } from '../utils/account-import'
import type { ParsedAccount, ParseError } from '../utils/account-import'
import { usePaginatedList, useTemplateList } from '../hooks'
import { Pagination, SearchInput, Modal, ConfirmDialog } from '../components/common'
import DynamicForm from '../components/DynamicForm'
import { jsonSchemaToFieldMeta } from '../../../shared/schemas/task-params'

const PAGE_SIZE = 10

const Accounts: React.FC = () => {
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
  } = usePaginatedList<Account>((p, ps, s) => accountApi.list(p, ps, s), PAGE_SIZE)
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
  const [editingItem, setEditingItem] = useState<Account | null>(null)
  const [editForm, setEditForm] = useState({ pool: '', notes: '', labels: '', data: '{}' })
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [showBatchImport, setShowBatchImport] = useState(false)
  const [batchJson, setBatchJson] = useState('')
  const [batchError, setBatchError] = useState<string | null>(null)
  const [showImportPreview, setShowImportPreview] = useState(false)
  const [importValid, setImportValid] = useState<ParsedAccount[]>([])
  const [importErrors, setImportErrors] = useState<ParseError[]>([])
  const [importing, setImporting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [showPoolConfirm, setShowPoolConfirm] = useState(false)
  const pendingCreateRef = useRef<Record<string, unknown> | null>(null)

  const handleExport = useCallback(async () => {
    try {
      const resp = await accountApi.list(1, 9999)
      const exportData = resp.items.map((item) => ({
        templateId: item.templateId,
        data: item.data,
        pool: item.pool,
        labels: item.labels,
        notes: item.notes
      }))
      const json = JSON.stringify(exportData, null, 2)
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const result = await dialogApi.saveFile(`accounts-${date}.json`, json)
      if (!result.canceled && result.filePath) {
        toast.success(t('accounts.exportSuccess'))
      }
    } catch {
      toast.error(t('accounts.exportFailed'))
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
        setBatchError(t('accounts.batchImportInvalidArray'))
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
      const count = await accountApi.batchCreate(items)
      setShowBatchImport(false)
      setBatchJson('')
      toast.success(t('accounts.batchImportSuccess', { count }))
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
      const { valid, errors } = parseAccountImport(result.content, templatesResp.items)
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
      const count = await accountApi.batchCreate(importValid)
      setShowImportPreview(false)
      setImportValid([])
      setImportErrors([])
      toast.success(t('accounts.importSucceeded', { count }))
      fetchData()
    } catch {
      toast.error(t('common.operationFailed'))
    } finally {
      setImporting(false)
    }
  }, [importValid, t, fetchData])

  const doCreateAccount = useCallback(
    async (parsedData: Record<string, unknown>) => {
      setCreating(true)
      setCreateError(null)
      try {
        await accountApi.create({
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
    if (selectedTemplate?.schema && Object.keys(selectedTemplate.schema).length > 0) {
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
      const pools = await accountApi.listPools()
      const poolName = form.pool.trim()
      if (!pools.includes(poolName)) {
        pendingCreateRef.current = parsedData
        setShowPoolConfirm(true)
        return
      }
    } catch {
      console.warn('Pool check failed, proceeding anyway')
    }
    doCreateAccount(parsedData)
  }, [form, t, templates, doCreateAccount])

  const handlePoolConfirm = useCallback(async () => {
    setShowPoolConfirm(false)
    if (pendingCreateRef.current) {
      const data = pendingCreateRef.current
      pendingCreateRef.current = null
      await doCreateAccount(data)
    }
  }, [doCreateAccount])

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
      await accountApi.delete(deleteTarget)
      fetchData()
    } catch {
      toast.error(t('common.operationFailed'))
    } finally {
      setDeleteTarget(null)
    }
  }, [deleteTarget, t, fetchData])

  const openEdit = (item: Account): void => {
    setEditingItem(item)
    setEditForm({
      pool: item.pool,
      notes: item.notes,
      labels: item.labels.join(', '),
      data: JSON.stringify(item.data, null, 2)
    })
    setEditError(null)
  }

  const handleEdit = useCallback(async () => {
    if (!editingItem) return
    let parsedData: Record<string, unknown> = {}
    try {
      parsedData = JSON.parse(editForm.data || '{}')
    } catch {
      setEditError(t('common.invalidJson'))
      return
    }
    setSaving(true)
    setEditError(null)
    try {
      await accountApi.update(editingItem.id, {
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
  }, [editingItem, editForm, t, fetchData])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('accounts.title')}</h1>
        <div className="flex items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('accounts.searchPlaceholder')}
          />
          <button
            onClick={() => setShowBatchImport(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-text-secondary bg-bg-tertiary rounded-lg hover:bg-bg-card-hover transition-colors"
          >
            <Upload size={16} />
            {t('accounts.batchImport')}
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-text-secondary bg-bg-tertiary rounded-lg hover:bg-bg-card-hover transition-colors"
          >
            <Download size={16} />
            {t('accounts.export')}
          </button>
          <button
            onClick={handleFileImport}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-text-secondary bg-bg-tertiary rounded-lg hover:bg-bg-card-hover transition-colors"
          >
            <FileDown size={16} />
            {t('accounts.importFile')}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-hover transition-colors"
          >
            <Plus size={16} />
            {t('accounts.createAccount')}
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
          <p className="mt-4 text-lg">{t('accounts.noAccounts')}</p>
        </div>
      ) : (
        <>
          <div className="bg-bg-card rounded-xl border border-border-light overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-light bg-bg-tertiary">
                  <th className="text-left px-4 py-3 font-medium text-text-secondary">
                    {t('accounts.templateId')}
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-text-secondary">
                    {t('accounts.pool')}
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-text-secondary">
                    {t('accounts.labels')}
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-text-secondary">
                    {t('accounts.notes')}
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-text-secondary">
                    {t('accounts.createdAt')}
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-text-secondary">
                    {t('accounts.actions')}
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
                        t('accounts.unknownTemplate')}
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
        title={t('accounts.createAccount')}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              {t('accounts.templateId')}
            </label>
            <select
              value={form.templateId}
              onChange={(e) => setForm((f) => ({ ...f, templateId: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">{t('accounts.selectTemplate')}</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.type})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              {t('accounts.pool')}
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
              {t('accounts.labels')}
            </label>
            <input
              type="text"
              value={form.labels}
              onChange={(e) => setForm((f) => ({ ...f, labels: e.target.value }))}
              placeholder={t('accounts.labelsPlaceholder')}
              className="w-full px-3 py-2 text-sm border border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              {t('accounts.notes')}
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
            const hasSchema = selectedTpl?.schema && selectedTpl.schema.properties
            if (hasSchema) {
              const fields = jsonSchemaToFieldMeta(selectedTpl!.schema)
              return (
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    {t('accounts.data')}
                  </label>
                  <DynamicForm
                    fields={fields}
                    defaultValues={form.dynamicFormValues}
                    onSubmit={(values) => setForm((f) => ({ ...f, dynamicFormValues: values }))}
                    submitLabel="更新"
                  />
                </div>
              )
            }
            return (
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  {t('accounts.data')} (JSON)
                </label>
                <textarea
                  value={form.data}
                  onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
                  rows={4}
                  className="w-full px-3 py-2 text-sm border border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono resize-none"
                />
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
        title={t('accounts.editAccount')}
        scrollable
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              {t('accounts.pool')}
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
              {t('accounts.labels')}
            </label>
            <input
              type="text"
              value={editForm.labels}
              onChange={(e) => setEditForm((f) => ({ ...f, labels: e.target.value }))}
              placeholder={t('accounts.labelsPlaceholder')}
              className="w-full px-3 py-2 text-sm border border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              {t('accounts.notes')}
            </label>
            <input
              type="text"
              value={editForm.notes}
              onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              {t('accounts.data')} (JSON)
            </label>
            <textarea
              value={editForm.data}
              onChange={(e) => setEditForm((f) => ({ ...f, data: e.target.value }))}
              rows={6}
              className="w-full px-3 py-2 text-sm border border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono resize-none"
            />
          </div>
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
        title={t('accounts.batchImportTitle')}
        scrollable
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              {t('accounts.batchImportLabel')}
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
            {t('accounts.batchImportDoImport')}
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
        title={t('accounts.importPreview')}
        scrollable
      >
        <div className="space-y-4">
          {importErrors.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-amber-700 mb-2">
                {t('accounts.importValidationError')}
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
                {t('accounts.parsedCount', {
                  valid: importValid.length,
                  error: importErrors.length
                })}
              </div>

              <div className="border border-border-light rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-bg-tertiary border-b border-border-light">
                      <th className="text-left px-3 py-2 font-medium text-text-secondary">
                        {t('accounts.templateId')}
                      </th>
                      <th className="text-left px-3 py-2 font-medium text-text-secondary">
                        {t('accounts.pool')}
                      </th>
                      <th className="text-left px-3 py-2 font-medium text-text-secondary">
                        {t('accounts.labels')}
                      </th>
                      <th className="text-left px-3 py-2 font-medium text-text-secondary">
                        {t('accounts.notes')}
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
        title={t('accounts.confirmDelete')}
        message={t('accounts.confirmDelete')}
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
        title={t('accounts.poolNotExistConfirm', { name: form.pool })}
        message={t('accounts.poolNotExistConfirm', { name: form.pool })}
        danger={false}
        confirmText={t('common.confirm')}
        cancelText={t('common.cancel')}
      />
    </div>
  )
}

export default Accounts

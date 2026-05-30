import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, Upload, Download, FileJson } from 'lucide-react'
import { dialogApi, fileApi, getMarketplaceUrl, getMarketplaceHeaders } from '../api'
import { toast } from 'sonner'

type FieldType = 'text' | 'number' | 'boolean' | 'select' | 'object'

interface SchemaField {
  id: number
  type: FieldType
  name: string
  title: string
  desc: string
  required: boolean
  options: string
}

interface TemplateMeta {
  id: string
  name: string
  type: string
  version: string
  description: string
}

let fieldIdCounter = 0
function createField(overrides?: Partial<SchemaField>): SchemaField {
  return {
    id: ++fieldIdCounter,
    type: 'text',
    name: '',
    title: '',
    desc: '',
    required: false,
    options: '',
    ...overrides
  }
}

export default function TemplateEditor() {
  const { t } = useTranslation()
  const [meta, setMeta] = useState<TemplateMeta>({
    id: '',
    name: '',
    type: '',
    version: '1.0.0',
    description: ''
  })
  const [fields, setFields] = useState<SchemaField[]>([])
  const [uploadStatus, setUploadStatus] = useState<{
    kind: 'idle' | 'uploading' | 'success' | 'error'
    message: string
  }>({ kind: 'idle', message: '' })

  const handleMetaChange = useCallback(
    (key: keyof TemplateMeta, value: string) => {
      setMeta((prev) => ({ ...prev, [key]: value }))
    },
    []
  )

  const addField = useCallback(() => {
    setFields((prev) => [...prev, createField()])
  }, [])

  const deleteField = useCallback((id: number) => {
    setFields((prev) => prev.filter((f) => f.id !== id))
  }, [])

  const updateField = useCallback(
    (id: number, patch: Partial<SchemaField>) => {
      setFields((prev) =>
        prev.map((f) => {
          if (f.id !== id) return f
          const updated = { ...f, ...patch }
          if (patch.type && patch.type !== 'select' && f.type === 'select') {
            updated.options = ''
          }
          return updated
        })
      )
    },
    []
  )

  const schema = useMemo(() => {
    const properties: Record<string, unknown> = {}
    const required: string[] = []
    for (const f of fields) {
      if (!f.name.trim()) continue
      const prop: Record<string, unknown> = {}
      if (f.type === 'select') {
        prop.type = 'string'
        if (f.options.trim()) {
          prop.enum = f.options
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        }
      } else if (f.type === 'object') {
        prop.type = 'object'
        prop.properties = {}
      } else {
        prop.type = f.type
      }
      if (f.title) prop.title = f.title
      if (f.desc) prop.description = f.desc
      properties[f.name.trim()] = prop
      if (f.required) required.push(f.name.trim())
    }
    return { type: 'object', properties, required }
  }, [fields])

  const handleImport = useCallback(async () => {
    const result = await dialogApi.openFile([
      { name: 'JSON Files', extensions: ['json'] }
    ])
    if (result.canceled || !result.filePath) return
    try {
      const readResult = await fileApi.readFile(result.filePath)
      if (!readResult.success || !readResult.content) {
        toast.error(t('templateEditor.readFailed', 'Failed to read file'))
        return
      }
      const parsed = JSON.parse(readResult.content)
      if (parsed.type !== 'object' || !parsed.properties) {
        toast.error(
          t(
            'templateEditor.invalidSchema',
            'JSON must have type:"object" and a properties object'
          )
        )
        return
      }
      const imported: SchemaField[] = []
      for (const [key, val] of Object.entries<Record<string, unknown>>(
        parsed.properties as Record<string, Record<string, unknown>>
      )) {
        const prop = val as Record<string, unknown>
        let type: FieldType = 'text'
        const rawType = prop.type as string
        if (rawType === 'number') type = 'number'
        else if (rawType === 'boolean') type = 'boolean'
        else if (rawType === 'object') type = 'object'
        else if (prop.enum) type = 'select'

        const field = createField({
          name: key,
          type,
          title: (prop.title as string) || '',
          desc: (prop.description as string) || '',
          required: (parsed.required as string[])?.includes(key) ?? false,
          options: prop.enum ? (prop.enum as string[]).join(', ') : ''
        })
        imported.push(field)
      }
      setFields(imported)
      toast.success(
        t('templateEditor.importedCount', 'Imported {{count}} fields').replace(
          '{{count}}',
          String(imported.length)
        )
      )
    } catch (e) {
      toast.error(
        `${t('common.error')}: ${e instanceof Error ? e.message : t('common.invalidJson')}`
      )
    }
  }, [t])

  const handleExport = useCallback(async () => {
    const json = JSON.stringify(schema, null, 2)
    const name = meta.name.trim()
      ? `${meta.name.trim().replace(/\s+/g, '-').toLowerCase()}-schema.json`
      : 'template-schema.json'
    await dialogApi.saveFile(name, json)
  }, [schema, meta.name])

  const handleUpload = useCallback(async () => {
    if (!meta.id.trim()) {
      setUploadStatus({
        kind: 'error',
        message: t('templateEditor.idRequired', 'Template ID is required')
      })
      return
    }
    if (!meta.name.trim()) {
      setUploadStatus({
        kind: 'error',
        message: t('templateEditor.nameRequired', 'Template name is required')
      })
      return
    }
    if (!meta.type.trim()) {
      setUploadStatus({
        kind: 'error',
        message: t('templateEditor.typeRequired', 'Template type is required')
      })
      return
    }
    setUploadStatus({
      kind: 'uploading',
      message: t('templateEditor.uploading', 'Uploading...')
    })
    try {
      const base = await getMarketplaceUrl()
      const headers = await getMarketplaceHeaders()
      const resp = await fetch(`${base}/api/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          id: meta.id.trim(),
          name: meta.name.trim(),
          type: meta.type.trim(),
          version: meta.version.trim() || '1.0.0',
          description: meta.description.trim(),
          schema
        })
      })
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${await resp.text()}`)
      }
      const msg = t('templateEditor.uploadSuccess', 'Upload successful')
      setUploadStatus({ kind: 'success', message: msg })
      toast.success(msg)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed'
      setUploadStatus({ kind: 'error', message: msg })
      toast.error(msg)
    }
  }, [meta, schema, t])

  const fieldTypeLabels: Record<FieldType, string> = {
    text: t('templateEditor.fieldTypeText'),
    number: t('templateEditor.fieldTypeNumber'),
    boolean: t('templateEditor.fieldTypeBoolean'),
    select: t('templateEditor.fieldTypeSelect'),
    object: t('templateEditor.fieldTypeObject')
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">{t('templateEditor.title')}</h2>
      <p className="text-text-muted text-sm">{t('templateEditor.subtitle')}</p>

      {/* ── Meta Info ── */}
      <div className="bg-bg-card border border-border-light rounded-xl p-5">
        <h3 className="text-base font-semibold mb-4 text-text-primary">
          {t('templateEditor.metaInfo')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-secondary mb-1">
              {t('templateEditor.id')} <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={meta.id}
              onChange={(e) => setMeta((m) => ({ ...m, id: e.target.value }))}
              placeholder={t('templateEditor.idPlaceholder', 'template-unique-id')}
              className="w-full bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">
              {t('templates.name')} *
            </label>
            <input
              type="text"
              value={meta.name}
              onChange={(e) => handleMetaChange('name', e.target.value)}
              placeholder="EVM Wallet"
              className="w-full bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">
              {t('templates.type')} *
            </label>
            <input
              type="text"
              value={meta.type}
              onChange={(e) => handleMetaChange('type', e.target.value)}
              placeholder="evm-wallet"
              className="w-full bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">
              {t('templates.version')}
            </label>
            <input
              type="text"
              value={meta.version}
              onChange={(e) => handleMetaChange('version', e.target.value)}
              placeholder="1.0.0"
              className="w-full bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary outline-none"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-text-secondary mb-1">
              {t('templateEditor.description')}
            </label>
            <input
              type="text"
              value={meta.description}
              onChange={(e) => handleMetaChange('description', e.target.value)}
              placeholder={t('templateEditor.descPlaceholder', 'EVM wallet account template')}
              className="w-full bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary outline-none"
            />
          </div>
        </div>
      </div>

      {/* ── Schema Field Builder Card ── */}
      <div className="bg-bg-card border border-border-light rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary">
            {t('templateEditor.schemaFields')}
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={addField}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-primary text-white hover:bg-primary-hover"
            >
              <Plus size={16} />
              {t('templateEditor.addField')}
            </button>
            <button
              onClick={handleImport}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-border-light text-text-secondary hover:border-primary hover:text-primary"
            >
              <Upload size={16} />
              {t('templateEditor.importJson')}
            </button>
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-border-light text-text-secondary hover:border-primary hover:text-primary"
            >
              <Download size={16} />
              {t('templateEditor.exportJson')}
            </button>
          </div>
        </div>

        {fields.length === 0 ? (
          <div className="py-12 text-center text-text-muted text-sm">
            <FileJson size={40} className="mx-auto mb-3 opacity-30" />
            {t('templateEditor.noFields')}
          </div>
        ) : (
          <div className="space-y-3">
            {fields.map((field) => (
              <FieldRow
                key={field.id}
                field={field}
                fieldTypeLabels={fieldTypeLabels}
                onChange={(patch) => updateField(field.id, patch)}
                onDelete={() => deleteField(field.id)}
                t={t}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── JSON Preview ── */}
      <div className="bg-bg-card border border-border-light rounded-xl p-5">
        <details>
          <summary className="text-sm font-semibold text-text-primary cursor-pointer select-none">
            {t('templateEditor.jsonPreview')}
          </summary>
          <pre className="mt-4 bg-bg-page border border-border-light rounded-lg p-4 text-xs text-text-secondary overflow-auto max-h-80 font-mono leading-relaxed">
            {JSON.stringify(schema, null, 2)}
          </pre>
        </details>
      </div>

      {/* ── Upload Bar ── */}
      <div className="bg-bg-card border border-border-light rounded-xl p-5">
        <div className="flex items-center gap-4">
          <button
            onClick={handleUpload}
            disabled={uploadStatus.kind === 'uploading'}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-colors bg-primary text-white hover:bg-primary-hover disabled:opacity-50"
          >
            <Upload size={18} />
            {t('templateEditor.uploadToServer')}
          </button>
          {uploadStatus.kind !== 'idle' && (
            <span
              className={`text-sm ${
                uploadStatus.kind === 'uploading'
                  ? 'text-text-muted'
                  : uploadStatus.kind === 'success'
                    ? 'text-success'
                    : 'text-danger'
              }`}
            >
              {uploadStatus.message}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Field Row Sub-component ── */

interface FieldRowProps {
  field: SchemaField
  fieldTypeLabels: Record<FieldType, string>
  onChange: (patch: Partial<SchemaField>) => void
  onDelete: () => void
  t: ReturnType<typeof useTranslation>['t']
}

function FieldRow({ field, fieldTypeLabels, onChange, onDelete, t }: FieldRowProps) {
  return (
    <div className="flex items-start gap-2 bg-bg-page border border-border-light rounded-lg p-3">
      {/* Type */}
      <div className="w-40 shrink-0">
        <label className="block text-[10px] text-text-muted mb-1 uppercase tracking-wider">
          {t('templateEditor.fieldType')}
        </label>
        <select
          value={field.type}
          onChange={(e) => onChange({ type: e.target.value as FieldType })}
          className="w-full bg-bg-input border border-border-light rounded-lg px-2.5 py-2 text-xs text-text-primary focus:border-primary outline-none appearance-none cursor-pointer"
        >
          {(Object.keys(fieldTypeLabels) as FieldType[]).map((ft) => (
            <option key={ft} value={ft}>
              {fieldTypeLabels[ft]}
            </option>
          ))}
        </select>
      </div>

      {/* Name */}
      <div className="w-36 shrink-0">
        <label className="block text-[10px] text-text-muted mb-1 uppercase tracking-wider">
          {t('templateEditor.fieldName')}
        </label>
        <input
          type="text"
          value={field.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="field_key"
          className="w-full bg-bg-input border border-border-light rounded-lg px-2.5 py-2 text-xs text-text-primary focus:border-primary outline-none font-mono"
        />
      </div>

      {/* Title */}
      <div className="w-36 shrink-0">
        <label className="block text-[10px] text-text-muted mb-1 uppercase tracking-wider">
          {t('templateEditor.fieldLabel')}
        </label>
        <input
          type="text"
          value={field.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder={t('templateEditor.fieldLabelPlaceholder', 'Display label')}
          className="w-full bg-bg-input border border-border-light rounded-lg px-2.5 py-2 text-xs text-text-primary focus:border-primary outline-none"
        />
      </div>

      {/* Description */}
      <div className="w-40 shrink-0">
        <label className="block text-[10px] text-text-muted mb-1 uppercase tracking-wider">
          {t('templateEditor.fieldDesc')}
        </label>
        <input
          type="text"
          value={field.desc}
          onChange={(e) => onChange({ desc: e.target.value })}
          placeholder="Field description"
          className="w-full bg-bg-input border border-border-light rounded-lg px-2.5 py-2 text-xs text-text-primary focus:border-primary outline-none"
        />
      </div>

      {/* Enum Options (only for select) */}
      {field.type === 'select' && (
        <div className="w-44 shrink-0">
          <label className="block text-[10px] text-text-muted mb-1 uppercase tracking-wider">
            {t('templateEditor.enumOptions')}
          </label>
          <input
            type="text"
            value={field.options}
            onChange={(e) => onChange({ options: e.target.value })}
            placeholder="option1, option2, option3"
            className="w-full bg-bg-input border border-border-light rounded-lg px-2.5 py-2 text-xs text-text-primary focus:border-primary outline-none"
          />
        </div>
      )}

      {/* Required */}
      <div className="w-14 shrink-0 flex flex-col items-center">
        <label className="block text-[10px] text-text-muted mb-1 uppercase tracking-wider">
          {t('templateEditor.required')}
        </label>
        <label className="flex items-center justify-center w-full h-8 cursor-pointer">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onChange({ required: e.target.checked })}
            className="accent-primary w-4 h-4 rounded"
          />
        </label>
      </div>

      {/* Delete */}
      <div className="pt-5 shrink-0">
        <button
          onClick={onDelete}
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-danger hover:bg-red-900/20 transition-colors"
          title={t('templateEditor.deleteField')}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  )
}

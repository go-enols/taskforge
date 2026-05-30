import React from 'react'
import { useTranslation } from 'react-i18next'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { FieldMeta } from '../../../shared/schemas/task-params'
import { fieldMetaToZodSchema } from '../../../shared/schemas/task-params'

interface DynamicFormProps {
  fields: FieldMeta[]
  defaultValues?: Record<string, unknown>
  onSubmit?: (values: Record<string, unknown>) => void | Promise<void>
  submitLabel?: string
  onCancel?: () => void
  onValuesChange?: (values: Record<string, unknown>) => void
}

const inputBase =
  'w-full px-3 py-2 rounded-lg border border-border-light bg-bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary'

const DynamicForm: React.FC<DynamicFormProps> = ({
  fields,
  defaultValues = {},
  onSubmit,
  submitLabel,
  onCancel,
  onValuesChange
}) => {
  const { t } = useTranslation()
  const schema = fieldMetaToZodSchema(fields)

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting }
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: buildDefaultValues(fields, defaultValues)
  })

  // 同步表单值到父组件（如 Tasks 页面需要实时获取表单数据）
  const watchedValues = watch()
  React.useEffect(() => {
    if (onValuesChange) onValuesChange(watchedValues as Record<string, unknown>)
  }, [watchedValues, onValuesChange])

  return (
    <form onSubmit={onSubmit ? handleSubmit(onSubmit) : (e) => e.preventDefault()} className="space-y-4">
      {fields.map((field) => (
        <div key={field.name}>
          <label className="block text-sm font-medium text-text-primary mb-1">
            {field.label}
            {!field.required && <span className="text-text-muted ml-1">{t('form.optional')}</span>}
          </label>
          <Controller
            name={field.name}
            control={control}
            render={({ field: rhfField }) => (
              <>{renderField(field, rhfField, getNestedError(errors, field.name), t)}</>
            )}
          />
          {field.description && field.description !== field.label && (
            <p className="text-xs text-text-muted mt-1">{field.description}</p>
          )}
        </div>
      ))}
      <div className="flex justify-end gap-2 pt-4">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm border border-border-light hover:bg-bg-card-hover rounded-lg transition-colors"
          >
            {t('common.cancel')}
          </button>
        )}
        {submitLabel !== '' && (
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? t('form.submitting') : (submitLabel || t('common.submit'))}
          </button>
        )}
      </div>
    </form>
  )
}

function buildDefaultValues(
  fields: FieldMeta[],
  overrides: Record<string, unknown>
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {}
  for (const field of fields) {
    if (overrides[field.name] !== undefined) {
      defaults[field.name] = overrides[field.name]
    } else if (field.defaultValue !== undefined) {
      defaults[field.name] = field.defaultValue
    } else if (field.type === 'boolean') {
      defaults[field.name] = false
    } else if (field.type === 'multiselect') {
      defaults[field.name] = []
    }
  }
  return defaults
}

function getNestedError(errors: Record<string, unknown>, name: string): string | undefined {
  const parts = name.split('.')
  let current: unknown = errors
  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  if (current && typeof current === 'object' && 'message' in current) {
    return (current as { message?: string }).message
  }
  return undefined
}

function renderField(
  field: FieldMeta,
  rhfField: { value: unknown; onChange: (...args: unknown[]) => void; onBlur: () => void },
  error: string | undefined,
  t: (key: string) => string
): React.ReactNode {
  const { value, onChange, onBlur } = rhfField

  switch (field.type) {
    case 'boolean': {
      const checked = Boolean(value ?? false)
      return (
        <div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => onChange(e.target.checked)}
              onBlur={onBlur}
              className="w-4 h-4 rounded border-border-light text-primary focus:ring-primary"
            />
          </div>
          {error && <span className="text-xs text-danger mt-1 block">{error}</span>}
        </div>
      )
    }

    case 'number':
      return (
        <div>
          <input
            type="number"
            value={value !== undefined && value !== null ? String(value) : ''}
            onChange={(e) => {
              const raw = e.target.value
              if (raw === '') {
                onChange(undefined)
                return
              }
              const num = Number(raw)
              if (!isNaN(num)) onChange(num)
            }}
            onBlur={onBlur}
            min={field.min}
            max={field.max}
            className={`${inputBase} ${error ? 'border-danger' : ''}`}
          />
          {error && <span className="text-xs text-danger mt-1 block">{error}</span>}
        </div>
      )

    case 'select': {
      const opts = field.options?.length ? field.options : null
      return (
        <div>
          <select
            value={value !== undefined && value !== null ? String(value) : ''}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            className={`${inputBase} ${error ? 'border-danger' : ''}`}
            disabled={!opts}
          >
            {opts ? (
              <>
                <option value="">{t('form.selectPlaceholder')}</option>
                {opts.map((opt) => (
                  <option key={String(opt.value)} value={String(opt.value)}>
                    {opt.label}
                  </option>
                ))}
              </>
            ) : (
              <option value="">{t('form.noOptions')}</option>
            )}
          </select>
          {error && <span className="text-xs text-danger mt-1 block">{error}</span>}
        </div>
      )
    }

    case 'multiselect': {
      const selected = Array.isArray(value) ? (value as string[]) : []
      return (
        <div>
          <select
            multiple
            value={selected}
            onChange={(e) => {
              const vals = Array.from(e.target.selectedOptions, (o) => o.value)
              onChange(vals)
            }}
            onBlur={onBlur}
            className={`${inputBase} min-h-[80px] ${error ? 'border-danger' : ''}`}
          >
            {field.options?.map((opt) => (
              <option key={String(opt.value)} value={String(opt.value)}>
                {opt.label}
              </option>
            ))}
          </select>
          {error && <span className="text-xs text-danger mt-1 block">{error}</span>}
        </div>
      )
    }

    case 'string':
    default:
      return (
        <div>
          <input
            type="text"
            value={value !== undefined && value !== null ? String(value) : ''}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            className={`${inputBase} ${error ? 'border-danger' : ''}`}
          />
          {error && <span className="text-xs text-danger mt-1 block">{error}</span>}
        </div>
      )
  }
}

export default DynamicForm

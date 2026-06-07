/**
 * @file ProjectTemplateSection — 项目模板选择 + 自定义字段动态渲染
 * @description 在项目表单顶部, 允许用户从可用模板中选择一个,
 *              并根据模板的 fields 数组动态渲染额外输入字段。
 *              模板驱动的字段值存到 form.customFields。
 *
 * 设计目标: 让用户基于模板创建项目, 模板定义该类项目要填的字段。
 * 详见 client/src/shared/types/index.ts 的 ProjectTemplate / ProjectTemplateField。
 *
 * @module renderer/components/airdrops
 */
import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileBox, ChevronDown } from 'lucide-react'
import { projectTemplateApi } from '../../../api'
import type { ProjectTemplate, ProjectTemplateField } from '../../../../../shared/types'
import type { AirdropFormData } from '../airdrop-defaults'

interface ProjectTemplateSectionProps {
  form: AirdropFormData
  onChange: (next: AirdropFormData) => void
}

/**
 * 根据 ProjectTemplateField 渲染一个动态输入控件
 *
 * 不引入完整 JSON Schema 校验库 — 我们只支持 4 种类型 (string/number/boolean/select)
 * 足以覆盖大部分项目元数据需求。
 */
const DynamicFieldInput: React.FC<{
  field: ProjectTemplateField
  value: unknown
  onChange: (v: unknown) => void
}> = ({ field, value, onChange }) => {
  const { t } = useTranslation()
  const inputClass =
    'w-full px-3 py-2 text-sm border border-border-light rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary'

  if (field.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="rounded border-border-light"
        />
        <span className="text-sm text-text-primary">{field.title}</span>
      </label>
    )
  }

  if (field.type === 'select') {
    return (
      <select
        value={(value as string) ?? (field.default as string) ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      >
        {!field.required && <option value="">{t('common.none')}</option>}
        {field.options?.map((opt: { value: string; label: string }) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    )
  }

  if (field.type === 'number') {
    return (
      <input
        type="number"
        value={value !== undefined && value !== null ? String(value) : ''}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        placeholder={field.placeholder ?? ''}
        className={inputClass}
      />
    )
  }

  // default: string
  return (
    <input
      type="text"
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder ?? ''}
      className={inputClass}
    />
  )
}

/**
 * ProjectTemplateSection — 模板选择 + 动态字段
 */
const ProjectTemplateSection: React.FC<ProjectTemplateSectionProps> = ({ form, onChange }) => {
  const { t } = useTranslation()
  const [templates, setTemplates] = useState<ProjectTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  // 加载模板列表
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    projectTemplateApi
      .list()
      .then((list: ProjectTemplate[]) => {
        if (!cancelled) setTemplates(list.filter((tpl: ProjectTemplate) => tpl.enabled))
      })
      .catch(() => {
        if (!cancelled) setTemplates([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  // 当前选中的模板
  const selectedTemplate = useMemo(
    () => templates.find((tpl) => tpl.id === form.templateId) ?? null,
    [templates, form.templateId]
  )

  const handleSelectTemplate = (tpl: ProjectTemplate): void => {
    // 切换模板时: 用新模板的默认值填充 customFields
    const newCustomFields: Record<string, unknown> = {}
    for (const f of tpl.fields) {
      if (f.default !== undefined) newCustomFields[f.name] = f.default
    }
    onChange({ ...form, templateId: tpl.id, customFields: newCustomFields })
    setShowPicker(false)
  }

  const handleClearTemplate = (): void => {
    onChange({ ...form, templateId: '', customFields: {} })
  }

  const handleCustomFieldChange = (name: string, value: unknown): void => {
    onChange({
      ...form,
      customFields: { ...form.customFields, [name]: value }
    })
  }

  return (
    <section className="space-y-3" data-section="template">
      <header className="flex items-center gap-2 text-text-primary">
        <FileBox size={14} className="text-text-muted" />
        <h3 className="text-sm font-semibold">{t('projectTemplate.sectionTitle')}</h3>
      </header>

      {/* 当前选中模板显示 */}
      {selectedTemplate ? (
        <div className="flex items-center justify-between p-3 border border-primary/30 bg-primary/5 rounded-lg">
          <div className="flex items-center gap-2">
            <FileBox size={16} className="text-primary" />
            <div>
              <div className="text-sm font-medium text-text-primary">{selectedTemplate.name}</div>
              {selectedTemplate.description && (
                <div className="text-xs text-text-muted mt-0.5">{selectedTemplate.description}</div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleClearTemplate}
            className="text-xs text-text-muted hover:text-danger"
          >
            {t('projectTemplate.changeTemplate')}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowPicker((v) => !v)}
            disabled={loading || templates.length === 0}
            className="w-full flex items-center justify-between px-3 py-2 text-sm border border-dashed border-border-light rounded-lg hover:bg-bg-card-hover transition-colors disabled:opacity-50"
          >
            <span className="text-text-muted">
              {loading
                ? t('common.loading')
                : t('projectTemplate.selectTemplateHint', { count: templates.length })}
            </span>
            <ChevronDown
              size={14}
              className={`text-text-muted transition-transform ${showPicker ? 'rotate-180' : ''}`}
            />
          </button>

          {showPicker && (
            <div className="border border-border-light rounded-lg divide-y divide-border-light/60 overflow-hidden">
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => handleSelectTemplate(tpl)}
                  className="w-full text-left p-3 hover:bg-bg-card-hover transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <FileBox size={14} className="text-text-muted" />
                    <div className="text-sm font-medium">{tpl.name}</div>
                    {tpl.builtIn && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted">
                        {t('projectTemplate.builtIn')}
                      </span>
                    )}
                  </div>
                  {tpl.description && (
                    <div className="text-xs text-text-muted mt-1 ml-5">{tpl.description}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 模板驱动的动态字段 */}
      {selectedTemplate && selectedTemplate.fields.length > 0 && (
        <div className="space-y-3 pt-2 border-t border-border-light/60">
          {selectedTemplate.fields.map((field) => (
            <div key={field.name}>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                {field.title}
                {field.required && <span className="text-danger ml-1">*</span>}
              </label>
              <DynamicFieldInput
                field={field}
                value={form.customFields[field.name]}
                onChange={(v) => handleCustomFieldChange(field.name, v)}
              />
              {field.description && (
                <p className="text-[11px] text-text-muted mt-1">{field.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default ProjectTemplateSection

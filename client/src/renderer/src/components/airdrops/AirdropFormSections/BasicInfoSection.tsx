/**
 * @file BasicInfoSection — 项目表单基础信息区块
 * @description 渲染项目创建/编辑表单的基础信息部分，包含项目名称（必填）、
 *              官网 URL（必填）和描述（支持 Markdown）。
 *              不再包含"所属公链"字段 (chain) — 该字段在产品定位升级时
 *              移除, 项目模板系统替代其位置。
 * @module renderer/components/airdrops
 */

import React from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Globe, AlignLeft } from 'lucide-react'
import type { AirdropFormData } from '../airdrop-defaults'

/** 基础信息字段的校验错误映射 */
export interface BasicInfoErrors {
  /** 名称字段错误信息 */
  name?: string
  /** 官网字段错误信息 */
  website?: string
}

/**
 * BasicInfoSection 组件的属性
 *
 * @param form    - 当前表单数据
 * @param onChange - 表单变更回调
 * @param errors  - 校验错误映射（可选）
 */
interface BasicInfoSectionProps {
  form: AirdropFormData
  onChange: (next: AirdropFormData) => void
  errors?: BasicInfoErrors
}

/**
 * BasicInfoSection — 基础信息区块
 *
 * 包含项目名称、官网和描述三个输入字段。
 * 名称和官网为必填项，带红色星号标记和校验错误提示。
 * 描述区域提示支持 Markdown 语法。
 *
 * @example
 * ```tsx
 * <BasicInfoSection form={form} onChange={setForm} errors={basicError} />
 * ```
 */
const BasicInfoSection: React.FC<BasicInfoSectionProps> = ({ form, onChange, errors = {} }) => {
  const { t } = useTranslation()

  const set = <K extends keyof AirdropFormData>(key: K, value: AirdropFormData[K]) =>
    onChange({ ...form, [key]: value })

  return (
    <section className="space-y-3" data-section="basic">
      {/* 基础信息区块标题 */}
      <header className="flex items-center gap-2 text-text-primary">
        <FileText size={14} className="text-text-muted" />
        <h3 className="text-sm font-semibold">{t('airdrops.sectionBasic')}</h3>
      </header>

      {/* 项目名称（必填） */}
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">
          {t('airdrops.name')} <span className="text-danger">*</span>
        </label>
        <input
          name="name"
          type="text"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary ${
            errors.name ? 'border-danger' : 'border-border-light'
          }`}
        />
        {errors.name && <p className="text-[11px] text-danger mt-1">{errors.name}</p>}
      </div>

      {/* 官网 URL（必填） */}
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1 flex items-center gap-1">
          <Globe size={11} />
          {t('airdrops.website')} <span className="text-danger">*</span>
        </label>
        <input
          name="website"
          type="url"
          value={form.website}
          onChange={(e) => set('website', e.target.value)}
          placeholder="https://example.com"
          className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary ${
            errors.website ? 'border-danger' : 'border-border-light'
          }`}
        />
        {errors.website && <p className="text-[11px] text-danger mt-1">{errors.website}</p>}
      </div>

      {/* 项目描述（支持 Markdown） */}
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1 flex items-center gap-1">
          <AlignLeft size={11} />
          {t('airdrops.description')}
          <span className="text-text-muted text-[11px] font-normal">
            {t('airdrops.descriptionMarkdownHint')}
          </span>
        </label>
        <textarea
          name="description"
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          rows={4}
          className="w-full px-3 py-2 text-sm border border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-y font-mono leading-relaxed"
        />
      </div>
    </section>
  )
}

export default BasicInfoSection

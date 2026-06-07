/**
 * @file TagsSection — 项目表单标签区块
 * @description 渲染项目表单的标签和分类标记编辑区域，提供两个文本输入框，
 *              以逗号分隔的形式编辑 tags（功能标签）和 labels（分类标记）。
 * @module renderer/components/airdrops
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Tags } from 'lucide-react'
import type { AirdropFormData } from '../airdrop-defaults'

interface TagsSectionProps {
  /** 当前表单数据 */
  form: AirdropFormData
  /** 表单变更回调 */
  onChange: (next: AirdropFormData) => void
}

/**
 * TagsSection — 标签区块
 *
 * 提供两个文本输入框，分别编辑 tags（逗号分隔的功能标签）和 labels（逗号分隔的分类标记）。
 * 数据在提交时由 fromFormData() 转换为数组格式。
 *
 * @param form    - 当前表单数据
 * @param onChange - 表单变更回调
 */
const TagsSection: React.FC<TagsSectionProps> = ({ form, onChange }) => {
  const { t } = useTranslation()
  /** 通用字段更新辅助函数 */
  const set = <K extends keyof AirdropFormData>(key: K, value: AirdropFormData[K]) =>
    onChange({ ...form, [key]: value })

  return (
    <section className="space-y-2" data-section="tags">
      <header className="flex items-center gap-2 text-text-primary">
        <Tags size={14} className="text-text-muted" />
        <h3 className="text-sm font-semibold">{t('airdrops.sectionTags')}</h3>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* 功能标签输入框 */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            {t('airdrops.tags')}
          </label>
          <input
            name="tags"
            type="text"
            value={form.tags}
            onChange={(e) => set('tags', e.target.value)}
            placeholder={t('airdrops.tagsPlaceholder')}
            className="w-full px-3 py-2 text-sm border border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        {/* 分类标记输入框 */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            {t('airdrops.labels')}
          </label>
          <input
            name="labels"
            type="text"
            value={form.labels}
            onChange={(e) => set('labels', e.target.value)}
            placeholder={t('airdrops.labelsPlaceholder')}
            className="w-full px-3 py-2 text-sm border border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>
    </section>
  )
}

export default TagsSection

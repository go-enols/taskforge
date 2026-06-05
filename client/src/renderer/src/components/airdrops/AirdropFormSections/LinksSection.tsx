/**
 * @file LinksSection — 空投表单链接区块
 * @description 渲染空投表单的链接编辑区域，支持添加/删除/修改链接条目，
 *              每条记录包含标签和 URL。
 * @module renderer/components/airdrops
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Link as LinkIcon, Plus, Trash2 } from 'lucide-react'
import { makeEmptyLink, type AirdropFormData } from '../airdrop-defaults'

interface LinksSectionProps {
  /** 当前表单数据 */
  form: AirdropFormData
  /** 表单变更回调 */
  onChange: (next: AirdropFormData) => void
}

/**
 * LinksSection — 链接区块
 *
 * 允许用户添加多条链接，每条包含标签（如"官网"、"Twitter"）和 URL。
 * 提供"添加"按钮和每行"删除"按钮。
 *
 * @param form    - 当前表单数据
 * @param onChange - 表单变更回调
 */
const LinksSection: React.FC<LinksSectionProps> = ({ form, onChange }) => {
  const { t } = useTranslation()

  /** 更新指定索引的链接的指定字段 */
  const update = (i: number, key: 'label' | 'url', value: string): void => {
    onChange({
      ...form,
      links: form.links.map((l, idx) => (idx === i ? { ...l, [key]: value } : l))
    })
  }
  /** 删除指定索引的链接 */
  const remove = (i: number): void => {
    onChange({ ...form, links: form.links.filter((_, idx) => idx !== i) })
  }
  /** 添加新的空链接 */
  const add = (): void => {
    onChange({ ...form, links: [...form.links, makeEmptyLink()] })
  }

  return (
    <section className="space-y-2" data-section="links">
      {/* 区块头部：标题 + 计数 + 添加按钮 */}
      <header className="flex items-center justify-between gap-2 text-text-primary">
        <div className="flex items-center gap-2">
          <LinkIcon size={14} className="text-text-muted" />
          <h3 className="text-sm font-semibold">{t('airdrops.sectionLinks')}</h3>
          {form.links.length > 0 && (
            <span className="text-[11px] text-text-muted">({form.links.length})</span>
          )}
        </div>
        <button
          type="button"
          data-testid="links-section-add"
          onClick={add}
          className="text-xs text-primary hover:text-primary-hover inline-flex items-center gap-0.5"
        >
          <Plus size={12} />
          {t('airdrops.addLink')}
        </button>
      </header>

      {/* 空状态提示或链接条目列表 */}
      {form.links.length === 0 ? (
        <p className="text-[11px] text-text-muted italic">{t('airdrops.noLinks')}</p>
      ) : (
        <div className="space-y-1.5">
          {form.links.map((l, i) => (
            <div
              key={i}
              className="flex items-start gap-1.5 p-2 rounded-lg bg-bg-card-hover/40 border border-border-light/60"
            >
              {/* 链接标签 */}
              <input
                name={`links.${i}.label`}
                type="text"
                value={l.label}
                onChange={(e) => update(i, 'label', e.target.value)}
                placeholder={t('airdrops.linkLabel')}
                className="w-1/3 px-2 py-1.5 text-xs border border-border-light rounded focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {/* 链接 URL */}
              <input
                name={`links.${i}.url`}
                type="url"
                value={l.url}
                onChange={(e) => update(i, 'url', e.target.value)}
                placeholder={t('airdrops.linkUrl')}
                className="flex-1 px-2 py-1.5 text-xs border border-border-light rounded focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {/* 删除按钮 */}
              <button
                type="button"
                data-testid={`links-section-remove-${i}`}
                onClick={() => remove(i)}
                className="p-1.5 text-text-muted hover:text-danger hover:bg-danger-light rounded shrink-0"
                aria-label={t('common.delete')}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default LinksSection

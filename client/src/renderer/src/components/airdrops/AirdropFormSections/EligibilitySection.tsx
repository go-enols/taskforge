/**
 * @file EligibilitySection — 项目表单资格标准区块
 * @description 渲染项目表单的资格标准编辑区域，支持添加/删除/修改资格条目，
 *              每条记录包含描述、要求类型、要求值、是否强制、是否已满足和备注。
 * @module renderer/components/airdrops
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Plus, Trash2 } from 'lucide-react'
import { makeEmptyEligibility, type AirdropFormData } from '../airdrop-defaults'

interface EligibilitySectionProps {
  /** 当前表单数据 */
  form: AirdropFormData
  /** 表单变更回调 */
  onChange: (next: AirdropFormData) => void
}

/**
 * EligibilitySection — 资格标准区块
 *
 * 允许用户添加多条资格标准，每条包含描述、要求类型、要求值、是否强制、是否已满足和备注。
 * 提供"添加"按钮和每行"删除"按钮，以及"强制"和"已满足"两个复选框。
 *
 * @param form    - 当前表单数据
 * @param onChange - 表单变更回调
 */
const EligibilitySection: React.FC<EligibilitySectionProps> = ({ form, onChange }) => {
  const { t } = useTranslation()

  /** 更新指定索引的资格标准的指定字段 */
  const update = (i: number, patch: Partial<AirdropFormData['eligibilityCriteria'][number]>): void => {
    onChange({
      ...form,
      eligibilityCriteria: form.eligibilityCriteria.map((c, idx) =>
        idx === i ? { ...c, ...patch } : c
      )
    })
  }
  /** 删除指定索引的资格标准 */
  const remove = (i: number): void => {
    onChange({ ...form, eligibilityCriteria: form.eligibilityCriteria.filter((_, idx) => idx !== i) })
  }
  /** 添加新的空资格标准 */
  const add = (): void => {
    onChange({ ...form, eligibilityCriteria: [...form.eligibilityCriteria, makeEmptyEligibility()] })
  }

  return (
    <section className="space-y-2" data-section="eligibility">
      {/* 区块头部：标题 + 计数 + 添加按钮 */}
      <header className="flex items-center justify-between gap-2 text-text-primary">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={14} className="text-text-muted" />
          <h3 className="text-sm font-semibold">{t('airdrops.sectionEligibility')}</h3>
          {form.eligibilityCriteria.length > 0 && (
            <span className="text-[11px] text-text-muted">({form.eligibilityCriteria.length})</span>
          )}
        </div>
        <button
          type="button"
          data-testid="eligibility-section-add"
          onClick={add}
          className="text-xs text-primary hover:text-primary-hover inline-flex items-center gap-0.5"
        >
          <Plus size={12} />
          {t('airdrops.addEligibility')}
        </button>
      </header>

      {/* 空状态提示或条目列表 */}
      {form.eligibilityCriteria.length === 0 ? (
        <p className="text-[11px] text-text-muted italic">{t('airdrops.noEligibility')}</p>
      ) : (
        <div className="space-y-1.5">
          {form.eligibilityCriteria.map((c, i) => (
            <div
              key={c.id}
              className="p-2 rounded-lg bg-bg-card-hover/40 border border-border-light/60 space-y-1.5"
            >
              {/* 第一行：描述 + 删除按钮 */}
              <div className="flex items-center gap-1.5">
                <input
                  name={`eligibility.${i}.description`}
                  type="text"
                  value={c.description}
                  onChange={(e) => update(i, { description: e.target.value })}
                  placeholder={t('airdrops.eligibilityDescription')}
                  className="flex-1 px-2 py-1.5 text-xs border border-border-light rounded focus:outline-none focus:ring-1 focus:ring-primary font-medium"
                />
                <button
                  type="button"
                  data-testid={`eligibility-section-remove-${i}`}
                  onClick={() => remove(i)}
                  className="p-1.5 text-text-muted hover:text-danger hover:bg-danger-light rounded shrink-0"
                  aria-label={t('common.delete')}
                >
                  <Trash2 size={12} />
                </button>
              </div>
              {/* 第二行：要求类型 + 要求值 */}
              <div className="flex items-center gap-1.5">
                <input
                  name={`eligibility.${i}.requirementType`}
                  type="text"
                  value={c.requirementType}
                  onChange={(e) => update(i, { requirementType: e.target.value })}
                  placeholder={t('airdrops.eligibilityType')}
                  className="flex-1 px-2 py-1.5 text-xs border border-border-light rounded focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <input
                  name={`eligibility.${i}.requirementValue`}
                  type="text"
                  value={c.requirementValue}
                  onChange={(e) => update(i, { requirementValue: e.target.value })}
                  placeholder={t('airdrops.eligibilityValue')}
                  className="flex-1 px-2 py-1.5 text-xs border border-border-light rounded focus:outline-none focus:ring-1 focus:ring-primary tabular-nums"
                />
              </div>
              {/* 第三行：强制 / 已满足 复选框 + 备注 */}
              <div className="flex items-center gap-3 text-xs text-text-secondary">
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    name={`eligibility.${i}.required`}
                    checked={c.required}
                    onChange={(e) => update(i, { required: e.target.checked })}
                    className="rounded border-border-light"
                  />
                  {t('airdrops.eligibilityRequired')}
                </label>
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    name={`eligibility.${i}.met`}
                    checked={c.met}
                    onChange={(e) => update(i, { met: e.target.checked })}
                    className="rounded border-border-light"
                  />
                  {t('airdrops.eligibilityMet')}
                </label>
                <input
                  name={`eligibility.${i}.notes`}
                  type="text"
                  value={c.notes}
                  onChange={(e) => update(i, { notes: e.target.value })}
                  placeholder={t('airdrops.earningNotes')}
                  className="flex-1 px-2 py-1 text-xs border border-border-light rounded focus:outline-none focus:ring-1 focus:ring-primary bg-bg-card text-text-muted italic"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default EligibilitySection

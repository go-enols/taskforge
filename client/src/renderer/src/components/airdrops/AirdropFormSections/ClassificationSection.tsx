import React from 'react'
import { useTranslation } from 'react-i18next'
import { Tag, Folder, FileCode, Loader2, X } from 'lucide-react'
import type { AirdropStatus, AirdropProjectType } from '../../../../../shared/types'
import type { AirdropFormData } from '../airdrop-defaults'

export interface ClassificationErrors {
  accountPool?: string
}

interface ClassificationSectionProps {
  form: AirdropFormData
  onChange: (next: AirdropFormData) => void
  errors?: ClassificationErrors
  scriptTemplates: Array<{ id: string; name: string; version: string }>
  accountPools: string[]
  loading: boolean
}

const STATUSES: AirdropStatus[] = ['ongoing', 'completed', 'cancelled', 'claimed']
const TYPES: AirdropProjectType[] = ['testnet', 'mainnet', 'galxe', 'quest', 'social', 'other']
const STATUS_KEY: Record<AirdropStatus, string> = {
  ongoing: 'airdrops.statusOngoing',
  completed: 'airdrops.statusCompleted',
  cancelled: 'airdrops.statusCancelled',
  claimed: 'airdrops.statusClaimed'
}
const TYPE_KEY: Record<AirdropProjectType, string> = {
  testnet: 'airdrops.typeTestnet',
  mainnet: 'airdrops.typeMainnet',
  galxe: 'airdrops.typeGalxe',
  quest: 'airdrops.typeQuest',
  social: 'airdrops.typeSocial',
  other: 'airdrops.typeOther'
}

const ClassificationSection: React.FC<ClassificationSectionProps> = ({
  form,
  onChange,
  errors = {},
  scriptTemplates,
  accountPools,
  loading
}) => {
  const { t } = useTranslation()
  const set = <K extends keyof AirdropFormData,>(key: K, value: AirdropFormData[K]) =>
    onChange({ ...form, [key]: value })

  return (
    <section className="space-y-3" data-section="classification">
      <header className="flex items-center gap-2 text-text-primary">
        <Tag size={14} className="text-text-muted" />
        <h3 className="text-sm font-semibold">{t('airdrops.sectionClassification')}</h3>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Status */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            {t('airdrops.status')}
          </label>
          <select
            name="status"
            value={form.status}
            onChange={(e) => set('status', e.target.value as AirdropStatus)}
            className="w-full px-3 py-2 text-sm border border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-bg-card"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(STATUS_KEY[s])}
              </option>
            ))}
          </select>
        </div>

        {/* Type */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            {t('airdrops.projectType')}
          </label>
          <select
            name="projectType"
            value={form.projectType}
            onChange={(e) => set('projectType', e.target.value as AirdropProjectType)}
            className="w-full px-3 py-2 text-sm border border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-bg-card"
          >
            {TYPES.map((tp) => (
              <option key={tp} value={tp}>
                {t(TYPE_KEY[tp])}
              </option>
            ))}
          </select>
        </div>

        {/* Account Pool —required */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1 flex items-center gap-1">
            <Folder size={11} />
            {t('airdrops.accountPool')}
            <span className="text-danger">*</span>
          </label>
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-text-muted">
              <Loader2 size={14} className="animate-spin" />
              {t('common.loading')}
            </div>
          ) : (
            <>
              <select
                name="accountPool"
                value={form.accountPool}
                onChange={(e) => set('accountPool', e.target.value)}
                disabled={accountPools.length === 0}
                className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-bg-card disabled:opacity-50 ${
                  errors.accountPool ? 'border-danger' : 'border-border-light'
                }`}
              >
                <option value="">{t('airdrops.selectAccountPool')}</option>
                {accountPools.map((pool) => (
                  <option key={pool} value={pool}>
                    {pool}
                  </option>
                ))}
              </select>
              {errors.accountPool && (
                <p className="text-[11px] text-danger mt-1">{errors.accountPool}</p>
              )}
              {!loading && accountPools.length === 0 && (
                <p className="text-[11px] text-text-muted mt-1">
                  {t('airdrops.noAccountPoolHint')}
                </p>
              )}
            </>
          )}
        </div>

        {/* Script template —optional */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1 flex items-center gap-1">
            <FileCode size={11} />
            {t('airdrops.scriptTemplateOptional')}
            <span className="text-text-muted text-[11px] font-normal">
              {t('form.optional')}
            </span>
          </label>
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-text-muted">
              <Loader2 size={14} className="animate-spin" />
              {t('common.loading')}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <select
                name="scriptTemplateId"
                value={form.scriptTemplateId}
                onChange={(e) => set('scriptTemplateId', e.target.value)}
                disabled={scriptTemplates.length === 0}
                className="flex-1 px-3 py-2 text-sm border border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-bg-card disabled:opacity-50"
              >
                <option value="">{t('airdrops.noScriptTemplate')}</option>
                {scriptTemplates.map((tmpl) => (
                  <option key={tmpl.id} value={tmpl.id}>
                    {tmpl.name} (v{tmpl.version})
                  </option>
                ))}
              </select>
              {form.scriptTemplateId && (
                <button
                  type="button"
                  onClick={() => set('scriptTemplateId', '')}
                  className="p-2 text-text-muted hover:text-danger hover:bg-danger-light rounded transition-colors shrink-0"
                  aria-label={t('common.delete')}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export default ClassificationSection

import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Loader2 } from 'lucide-react'
import {
  emptyForm,
  validateBasic,
  fromFormData,
  type AirdropFormData
} from './airdrop-defaults'
import BasicInfoSection from './AirdropFormSections/BasicInfoSection'
import ClassificationSection from './AirdropFormSections/ClassificationSection'
import LinksSection from './AirdropFormSections/LinksSection'
import EligibilitySection from './AirdropFormSections/EligibilitySection'
import TasksSection from './AirdropFormSections/TasksSection'
import EarningsSection from './AirdropFormSections/EarningsSection'
import TagsSection from './AirdropFormSections/TagsSection'
import ProjectTemplateSection from './AirdropFormSections/ProjectTemplateSection'

export type AirdropFormMode = 'create' | 'edit'

export interface AirdropFormModalProps {
  open: boolean
  mode: AirdropFormMode
  onClose: () => void
  onSubmit: (payload: ReturnType<typeof fromFormData>) => void
  /**
   * The current form data. If `null`, an empty form is used (create mode).
   * Owned and updated by the parent.
   */
  formData: AirdropFormData | null
  onChange: (next: AirdropFormData) => void
  scriptTemplates: Array<{ id: string; name: string; version: string }>
  accountPools: string[]
  loadingFormData: boolean
  /** When true, submit button shows spinner and is disabled */
  submitting?: boolean
  /** External error message to display at the bottom */
  errorMessage?: string | null
}

const AirdropFormModal: React.FC<AirdropFormModalProps> = ({
  open,
  mode,
  onClose,
  onSubmit,
  formData,
  onChange,
  scriptTemplates,
  accountPools,
  loadingFormData,
  submitting = false,
  errorMessage = null
}) => {
  const { t } = useTranslation()
  const [basicError, setBasicError] = useState<{ name?: string; website?: string; accountPool?: string }>({})

  // Local form state. We mirror the parent's formData on every change, but keep
  // a local copy so uncontrolled inputs work properly.
  const [local, setLocal] = useState<AirdropFormData>(formData ?? emptyForm())

  // Sync local state when parent passes new formData (create/edit/close-reopen).
  // This is the documented pattern for syncing controlled input state from a
  // parent prop. Disabling the lint rule below is intentional.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setLocal(formData ?? emptyForm())
  }, [formData, open])

  useEffect(() => {
    if (!open) {
      setBasicError({})
    }
  }, [open])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!open) return null

  const setForm = (next: AirdropFormData): void => {
    setLocal(next)
    onChange(next)
  }

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    const validation = validateBasic(local)
    if (!validation.valid) {
      setBasicError({ [validation.field]: t('airdrops.fieldRequired') })
      return
    }
    setBasicError({})
    onSubmit(fromFormData(local))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-modal-enter"
      role="dialog"
      aria-modal="true"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      tabIndex={-1}
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="modal-panel relative bg-bg-card rounded-xl shadow-xl ring-1 ring-border-light w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-6 py-4 border-b border-border-light">
          <h2 className="text-lg font-semibold text-text-primary">
            {mode === 'create' ? t('airdrops.createAirdrop') : t('airdrops.editAirdrop')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-tertiary rounded transition-colors"
            aria-label={t('common.close')}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        {loadingFormData ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-text-muted" />
            <span className="ml-2 text-sm text-text-muted">{t('common.loading')}</span>
          </div>
        ) : (
          <form
            id="airdrop-form"
            onSubmit={handleSubmit}
            className="flex-1 overflow-y-auto px-6 py-4 space-y-5"
          >
            <ProjectTemplateSection form={local} onChange={setForm} />
            <div className="border-t border-border-light/60" />
            <BasicInfoSection form={local} onChange={setForm} errors={basicError} />
            <div className="border-t border-border-light/60" />
            <ClassificationSection
              form={local}
              onChange={setForm}
              errors={basicError}
              scriptTemplates={scriptTemplates}
              accountPools={accountPools}
              loading={loadingFormData}
            />
            <div className="border-t border-border-light/60" />
            <LinksSection form={local} onChange={setForm} />
            <div className="border-t border-border-light/60" />
            <EligibilitySection form={local} onChange={setForm} />
            <div className="border-t border-border-light/60" />
            <TasksSection form={local} onChange={setForm} />
            <div className="border-t border-border-light/60" />
            <EarningsSection form={local} onChange={setForm} />
            <div className="border-t border-border-light/60" />
            <TagsSection form={local} onChange={setForm} />

            {errorMessage && (
              <div className="text-sm text-danger bg-danger-light border border-danger/30 rounded-lg px-3 py-2">
                {errorMessage}
              </div>
            )}
          </form>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-border-light bg-bg-card-hover/30">
          <button
            type="button"
            data-testid="airdrop-form-cancel"
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary rounded-lg transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="airdrop-form"
            data-testid="airdrop-form-submit"
            disabled={submitting || loadingFormData}
            className="px-4 py-1.5 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {submitting
              ? t('common.loading')
              : mode === 'create'
                ? t('common.create')
                : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AirdropFormModal

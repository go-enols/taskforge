/**
 * @file UpdateProgressModal — 更新进度弹窗组件
 * @description 以步骤列表 + 进度条的形式展示应用更新流程，
 *              支持检查/下载/安装三个阶段的状态反馈。
 * @module renderer/components
 */
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw, CheckCircle2, AlertCircle, Download, Zap } from 'lucide-react'
import Modal from './common/Modal'

/* ────────── Types ────────── */

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateProgressData {
  percent: number
  transferred: number
  total: number
  bytesPerSecond?: number
}

interface UpdateProgressModalProps {
  open: boolean
  status: UpdateStatus
  version?: string
  progress: UpdateProgressData
  errorMessage?: string
  onClose: () => void
  onDownload?: () => void
  onInstall?: () => void
}

/* ────────── Helpers ────────── */

type StepKey = 'check' | 'download' | 'ready' | 'install'

interface StepState {
  key: StepKey
  label: string
  status: 'pending' | 'active' | 'completed' | 'error'
}

/**
 * 根据当前 updateStatus 计算 4 个步骤各自的状态
 */
function computeSteps(
  status: UpdateStatus,
  t: (key: string) => string
): StepState[] {
  const steps: { key: StepKey; labelKey: string }[] = [
    { key: 'check', labelKey: 'updates.step.checking' },
    { key: 'download', labelKey: 'updates.step.downloading' },
    { key: 'ready', labelKey: 'updates.step.ready' },
    { key: 'install', labelKey: 'updates.step.install' }
  ]

  return steps.map((s) => {
    switch (s.key) {
      case 'check':
        if (status === 'checking') return { ...s, label: t(s.labelKey), status: 'active' }
        if (status === 'error') return { ...s, label: t(s.labelKey), status: 'error' }
        if (status === 'idle' || status === 'not-available') return { ...s, label: t(s.labelKey), status: 'pending' }
        return { ...s, label: t(s.labelKey), status: 'completed' }
      case 'download':
        if (status === 'checking' || status === 'not-available' || status === 'error')
          return { ...s, label: t(s.labelKey), status: 'pending' }
        if (status === 'idle') return { ...s, label: t(s.labelKey), status: 'pending' }
        if (status === 'available') return { ...s, label: t(s.labelKey), status: 'active' }
        if (status === 'downloading') return { ...s, label: t(s.labelKey), status: 'active' }
        return { ...s, label: t(s.labelKey), status: 'completed' }
      case 'ready':
        if (
          status === 'idle' ||
          status === 'checking' ||
          status === 'not-available' ||
          status === 'error' ||
          status === 'available'
        )
          return { ...s, label: t(s.labelKey), status: 'pending' }
        if (status === 'downloading') return { ...s, label: t(s.labelKey), status: 'active' }
        return { ...s, label: t(s.labelKey), status: 'completed' }
      case 'install':
        if (status === 'downloaded') return { ...s, label: t(s.labelKey), status: 'active' }
        return { ...s, label: t(s.labelKey), status: 'pending' }
      default:
        return { ...s, label: t(s.labelKey), status: 'pending' }
    }
  })
}

/* ────────── Step Icon ────────── */

const StepIcon: React.FC<{ stepStatus: StepState['status'] }> = ({ stepStatus }) => {
  switch (stepStatus) {
    case 'completed':
      return <CheckCircle2 size={18} className="text-green-500 shrink-0" />
    case 'active':
      return <RefreshCw size={18} className="text-blue-500 animate-spin shrink-0" />
    case 'error':
      return <AlertCircle size={18} className="text-red-500 shrink-0" />
    case 'pending':
    default:
      return <span className="w-[18px] h-[18px] rounded-full border-2 border-gray-400 shrink-0" />
  }
}

/* ────────── Component ────────── */

const UpdateProgressModal: React.FC<UpdateProgressModalProps> = ({
  open,
  status,
  version,
  progress,
  errorMessage,
  onClose,
  onDownload,
  onInstall
}) => {
  const { t } = useTranslation()

  /**
   * Whether the close button is enabled.
   * - idle / not-available / error / downloaded: user is allowed to close freely
   * - checking / available / downloading: we still let the user close (the modal
   *   is just a UI affordance; the autoUpdater task can't be cancelled programmatically
   *   and will keep running in the background). We just hide the icon-button
   *   affordance and show a single "close" button instead of "cancel".
   */
  const canClose = true

  /** Always-available close (since the modal is purely a UI overlay) */
  const safeClose = (): void => onClose()

  const steps = useMemo(() => computeSteps(status, t), [status, t])

  /* ── Derived display values ── */

  const headerIcon = (() => {
    switch (status) {
      case 'checking':
      case 'downloading':
        return <RefreshCw size={20} className="text-blue-500 animate-spin" />
      case 'downloaded':
        return <CheckCircle2 size={20} className="text-green-500" />
      case 'error':
        return <AlertCircle size={20} className="text-red-500" />
      case 'not-available':
        return <CheckCircle2 size={20} className="text-green-500" />
      default:
        return <RefreshCw size={20} className="text-text-muted" />
    }
  })()

  const descKey = (() => {
    switch (status) {
      case 'checking': return 'updates.stepDesc.checking'
      case 'available': return 'updates.stepDesc.available'
      case 'downloading': return 'updates.stepDesc.downloading'
      case 'downloaded': return 'updates.stepDesc.ready'
      case 'error': return 'updates.stepDesc.error'
      default: return null
    }
  })()

  const transferredMB = (progress.transferred / 1024 / 1024).toFixed(1)
  const totalMB = (progress.total / 1024 / 1024).toFixed(1)
  const speedMBs = progress.bytesPerSecond
    ? (progress.bytesPerSecond / 1024 / 1024).toFixed(1)
    : null

  const showProgress = status === 'downloading' && progress.total > 0
  const showError = status === 'error'

  /* ── Action buttons ── */

  const renderButtons = (): React.ReactNode => {
    switch (status) {
      case 'idle':
      case 'not-available':
      case 'error':
        return (
          <button
            onClick={safeClose}
            className="px-4 py-2 text-sm border border-border-light rounded-lg hover:bg-bg-card-hover transition-colors"
          >
            {t('updates.buttons.close')}
          </button>
        )
      case 'checking':
        return (
          <button
            onClick={safeClose}
            className="px-4 py-2 text-sm border border-border-light rounded-lg hover:bg-bg-card-hover transition-colors"
          >
            {t('updates.buttons.close')}
          </button>
        )
      case 'available':
        return (
          <div className="flex justify-end gap-2">
            <button
              onClick={safeClose}
              className="px-4 py-2 text-sm border border-border-light rounded-lg hover:bg-bg-card-hover transition-colors"
            >
              {t('updates.buttons.later')}
            </button>
            <button
              onClick={onDownload}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
            >
              <Download size={14} />
              {t('updates.buttons.download')}
            </button>
          </div>
        )
      case 'downloading':
        return (
          <div className="flex items-center justify-between w-full">
            <p className="text-xs text-text-muted">
              {t('updates.buttons.backgroundHint')}
            </p>
            <button
              onClick={safeClose}
              className="px-4 py-2 text-sm border border-border-light rounded-lg hover:bg-bg-card-hover transition-colors"
            >
              {t('updates.buttons.close')}
            </button>
          </div>
        )
      case 'downloaded':
        return (
          <div className="flex justify-end gap-2">
            <button
              onClick={safeClose}
              className="px-4 py-2 text-sm border border-border-light rounded-lg hover:bg-bg-card-hover transition-colors"
            >
              {t('updates.buttons.later')}
            </button>
            <button
              onClick={onInstall}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
            >
              <Zap size={14} />
              {t('updates.buttons.installNow')}
            </button>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <Modal
      open={open}
      onClose={safeClose}
      title=""
      maxWidth="max-w-md"
      scrollable={false}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        {headerIcon}
        <h2 className="text-lg font-semibold text-text-primary">
          {t('updates.modalTitle')}
        </h2>
        {canClose && (
          <button
            onClick={safeClose}
            className="ml-auto p-1 rounded-md hover:bg-bg-card-hover transition-colors text-text-muted"
            aria-label={t('common.close')}
          >
            <AlertCircle size={0} className="hidden" />
            {/* Using CSS to show X */}
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        )}
      </div>

      {/* Version info */}
      {version && (status === 'available' || status === 'downloading' || status === 'downloaded') && (
        <p className="text-sm text-text-secondary mb-4">
          {t('updates.version')}: <span className="font-mono text-primary">{version}</span>
        </p>
      )}

      {/* Error banner */}
      {showError && (
        <div className="px-3 py-2 mb-4 text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg">
          {errorMessage || t('updates.stepDesc.error')}
        </div>
      )}

      {/* Steps */}
      <div className="space-y-3 mb-4">
        {steps.map((step) => (
          <div
            key={step.key}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              step.status === 'active'
                ? 'bg-blue-50 dark:bg-blue-900/20'
                : step.status === 'completed'
                  ? 'bg-green-50 dark:bg-green-900/10'
                  : ''
            }`}
          >
            <StepIcon stepStatus={step.status} />
            <span
              className={`text-sm ${
                step.status === 'active'
                  ? 'text-blue-600 dark:text-blue-400 font-medium'
                  : step.status === 'completed'
                    ? 'text-green-700 dark:text-green-400'
                    : step.status === 'error'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-text-muted'
              }`}
            >
              {step.label}
            </span>
            <span className="ml-auto text-xs text-text-muted">
              {step.status === 'completed'
                ? t('updates.stepStatus.completed')
                : step.status === 'active'
                  ? t('updates.stepStatus.active')
                  : step.status === 'error'
                    ? t('updates.stepStatus.error')
                    : t('updates.stepStatus.pending')}
            </span>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      {showProgress && (
        <div className="mb-4 space-y-2">
          <div className="flex justify-between text-xs text-text-muted">
            <span>{t('updates.percent', { percent: Math.round(progress.percent) })}</span>
            <span>{t('updates.downloadedOf', { transferred: transferredMB, total: totalMB })}</span>
          </div>
          <div className="w-full bg-bg-tertiary rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-primary h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(progress.percent, 100)}%` }}
            />
          </div>
          {speedMBs && (
            <p className="text-xs text-text-muted">
              {t('updates.speed', { speed: speedMBs })}
            </p>
          )}
        </div>
      )}

      {/* Description text */}
      {descKey && (
        <p className="text-sm text-text-secondary mb-4">{t(descKey)}</p>
      )}

      {/* Action buttons */}
      {renderButtons() !== null && (
        <div className="flex justify-end">{renderButtons()}</div>
      )}
    </Modal>
  )
}

export default UpdateProgressModal

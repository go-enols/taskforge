import React from 'react'
import { useTranslation } from 'react-i18next'
import {
  ExternalLink,
  Edit3,
  Trash2,
  X,
  Link as LinkIcon,
  ListChecks,
  DollarSign,
  CheckCircle2,
  Calendar,
  Layers,
  Tag as TagIcon
} from 'lucide-react'
import type {
  AirdropLink,
  AirdropProject,
  AirdropTaskItem,
  AirdropTaskStatus,
  Earning,
  EligibilityCriterion
} from '../../../../shared/types'
import {
  statusColorMap,
  typeColorMap,
  statusLabelKey,
  typeLabelKey,
  formatEarningsSummary
} from './airdrop-mappers'

interface AirdropDetailModalProps {
  project: AirdropProject
  open: boolean
  onClose: () => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}

const TASK_STATUS_KEY: Record<AirdropTaskStatus, string> = {
  pending: 'tasks.status.idle',
  inProgress: 'tasks.status.running',
  completed: 'tasks.status.complete',
  skipped: 'tasks.status.paused'
}

const TASK_STATUS_COLOR: Record<AirdropTaskStatus, string> = {
  pending: 'bg-bg-tertiary text-text-secondary',
  inProgress: 'bg-primary-light text-primary',
  completed: 'bg-success-light text-success',
  skipped: 'bg-warning-light text-warning'
}

const AirdropDetailModal: React.FC<AirdropDetailModalProps> = ({
  project,
  open,
  onClose,
  onEdit,
  onDelete
}) => {
  const { t } = useTranslation()
  if (!open) return null

  const earnings = formatEarningsSummary(project.earnings)

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
        className="modal-panel relative bg-bg-card rounded-xl shadow-xl ring-1 ring-border-light p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-text-primary leading-tight">
              {project.name}
            </h2>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span
                className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full font-medium ${statusColorMap[project.status]}`}
              >
                {t(statusLabelKey[project.status])}
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full font-medium ${typeColorMap[project.projectType]}`}
              >
                {t(typeLabelKey[project.projectType])}
              </span>
              {project.chain && (
                <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full font-medium bg-bg-tertiary text-text-secondary">
                  {project.chain}
                </span>
              )}
            </div>
          </div>
          <button
            data-testid="airdrop-detail-close"
            onClick={onClose}
            className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-tertiary rounded transition-colors shrink-0"
            aria-label={t('common.close')}
          >
            <X size={16} />
          </button>
        </div>

        {/* Meta grid: website, account pool */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 p-3 rounded-lg bg-bg-tertiary/40 border border-border-light/60">
          <div>
            <div className="text-[11px] text-text-muted font-medium mb-0.5">
              {t('airdrops.website')}
            </div>
            <a
              href={project.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline inline-flex items-center gap-1"
            >
              <ExternalLink size={12} />
              {project.website || '-'}
            </a>
          </div>
          <div>
            <div className="text-[11px] text-text-muted font-medium mb-0.5 flex items-center gap-1">
              <Layers size={11} />
              {t('airdrops.accountPool')}
            </div>
            <div className="text-sm text-text-primary">{project.accountPool || '-'}</div>
          </div>
        </div>

        {/* Description */}
        {project.description && (
          <div className="mb-4">
            <div className="text-[11px] text-text-muted font-medium mb-1">
              {t('airdrops.description')}
            </div>
            <div className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed p-3 rounded-lg bg-bg-card-hover/40 border border-border-light/40 max-h-48 overflow-y-auto">
              {project.description}
            </div>
          </div>
        )}

        {/* Links */}
        <div className="mb-4">
          <div className="flex items-center gap-1 text-sm font-semibold text-text-primary mb-2">
            <LinkIcon size={14} />
            {t('airdrops.counts.links', { count: project.links.length })}
          </div>
          {project.links.length === 0 ? (
            <p className="text-xs text-text-muted">{t('airdrops.noLinks')}</p>
          ) : (
            <div className="space-y-1">
              {project.links.map((l: AirdropLink, i: number) => (
                <a
                  key={i}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <ExternalLink size={12} />
                  <span className="font-medium">{l.label || l.url}</span>
                  {l.label && <span className="text-text-muted text-xs">- {l.url}</span>}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Tasks */}
        <div className="mb-4">
          <div className="flex items-center gap-1 text-sm font-semibold text-text-primary mb-2">
            <ListChecks size={14} />
            {t('airdrops.counts.tasks', { count: project.tasks.length })}
          </div>
          {project.tasks.length === 0 ? (
            <p className="text-xs text-text-muted">{t('airdrops.noTasks')}</p>
          ) : (
            <div className="space-y-1.5">
              {project.tasks.map((task: AirdropTaskItem) => (
                <div
                  key={task.id}
                  className="flex items-start gap-2 p-2 rounded-lg bg-bg-card-hover/40 border border-border-light/40"
                >
                  <CheckCircle2
                    size={14}
                    className={`mt-0.5 shrink-0 ${
                      task.status === 'completed' ? 'text-success' : 'text-text-muted'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-text-primary">{task.title}</span>
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 text-[10px] rounded-full font-medium ${TASK_STATUS_COLOR[task.status]}`}
                      >
                        {t(TASK_STATUS_KEY[task.status])}
                      </span>
                      {task.deadline && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-text-muted">
                          <Calendar size={10} />
                          {task.deadline}
                        </span>
                      )}
                    </div>
                    {task.description && (
                      <p className="text-xs text-text-secondary mt-0.5">{task.description}</p>
                    )}
                    {task.notes && (
                      <p className="text-[10px] text-text-muted mt-0.5 italic">- {task.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Earnings */}
        <div className="mb-4">
          <div className="flex items-center gap-1 text-sm font-semibold text-text-primary mb-2">
            <DollarSign size={14} />
            {t('airdrops.counts.earnings', { count: project.earnings.length })}
          </div>
          {project.earnings.length === 0 ? (
            <p className="text-xs text-text-muted">{t('airdrops.noEarnings')}</p>
          ) : (
            <div className="space-y-1">
              {project.earnings.map((e: Earning) => (
                <div
                  key={e.id}
                  className="flex items-center gap-2 p-2 rounded-lg bg-bg-card-hover/40 border border-border-light/40"
                >
                  <span className="text-sm font-bold text-text-primary tabular-nums">
                    {e.amount} {e.token}
                  </span>
                  {e.valueUsd != null && e.valueUsd > 0 && (
                    <span className="text-xs text-text-muted tabular-nums">
                      (${e.valueUsd.toLocaleString()})
                    </span>
                  )}
                  <span className="text-[10px] text-text-muted ml-auto">
                    <Calendar size={10} className="inline mr-0.5" />
                    {e.date}
                  </span>
                  {e.notes && (
                    <span className="text-[10px] text-text-muted italic truncate">- {e.notes}</span>
                  )}
                </div>
              ))}
              {earnings.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border-light/40">
                  <div className="text-[11px] text-text-muted font-medium mb-1">
                    {t('airdrops.earningsSummary')}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {earnings.map((row, idx) => (
                      <span
                        key={`${row.token}-${idx}`}
                        className="inline-flex items-center px-2 py-0.5 text-xs rounded-full font-medium bg-success-light text-success"
                      >
                        {row.amount} {row.token}
                        {row.valueUsd > 0 && (
                          <span className="ml-1 text-[10px] opacity-75">
                            ${row.valueUsd.toLocaleString()}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Eligibility criteria */}
        {project.eligibilityCriteria.length > 0 && (
          <div className="mb-4">
            <div className="text-sm font-semibold text-text-primary mb-2">
              {t('airdrops.eligibility')}
            </div>
            <div className="space-y-1">
              {project.eligibilityCriteria.map((c: EligibilityCriterion) => (
                <div
                  key={c.id}
                  className="flex items-start gap-2 p-2 rounded-lg bg-bg-card-hover/40 border border-border-light/40"
                >
                  <CheckCircle2
                    size={14}
                    className={`mt-0.5 shrink-0 ${c.met ? 'text-success' : 'text-text-muted'}`}
                  />
                  <div className="flex-1 min-w-0 text-sm">
                    <span className="text-text-primary">{c.description}</span>
                    {(c.requirementType || c.requirementValue) && (
                      <span className="text-xs text-text-muted ml-1">
                        ({c.requirementType}={c.requirementValue})
                      </span>
                    )}
                    {c.required && (
                      <span className="ml-1.5 text-[10px] text-danger font-medium">
                        {t('airdrops.eligibilityRequired')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tags & labels */}
        {(project.tags.length > 0 || project.labels.length > 0) && (
          <div className="mb-4">
            <div className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-1">
              <TagIcon size={14} />
              {t('common.label')}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {project.tags.map((tag: string, i: number) => (
                <span
                  key={`t${i}`}
                  className="inline-block px-2 py-0.5 text-xs bg-bg-tertiary text-text-secondary rounded-full"
                >
                  {tag}
                </span>
              ))}
              {project.labels.map((label: string, i: number) => (
                <span
                  key={`l${i}`}
                  className="inline-block px-2 py-0.5 text-xs bg-primary-light text-primary rounded-full font-medium"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t border-border-light">
          <button
            data-testid="airdrop-detail-delete"
            onClick={() => onDelete(project.id)}
            className="px-3 py-1.5 text-sm text-danger hover:bg-danger-light rounded-lg transition-colors inline-flex items-center gap-1"
          >
            <Trash2 size={14} />
            {t('common.delete')}
          </button>
          <button
            data-testid="airdrop-detail-edit"
            onClick={() => onEdit(project.id)}
            className="px-3 py-1.5 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-hover transition-colors inline-flex items-center gap-1"
          >
            <Edit3 size={14} />
            {t('common.edit')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AirdropDetailModal

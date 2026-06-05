/**
 * @file AirdropCard — 空投项目卡片组件
 * @description 渲染空投项目列表中的卡片视图，包含项目名称、状态、类型、描述、链接、任务和收益摘要。
 *              支持点击查看详情、编辑和删除操作。
 * @module renderer/components/airdrops
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import {
  ExternalLink,
  Edit3,
  Trash2,
  Link as LinkIcon,
  ListChecks,
  DollarSign,
  Layers
} from 'lucide-react'
import type { AirdropLink, AirdropProject } from '../../../../shared/types'
import {
  statusColorMap,
  typeColorMap,
  statusLabelKey,
  typeLabelKey,
  statusBorderClass,
  formatEarningsSummary
} from './airdrop-mappers'

interface AirdropCardProps {
  /** 空投项目数据 */
  project: AirdropProject
  /** 编辑回调 */
  onEdit: (id: string) => void
  /** 删除回调 */
  onDelete: (id: string) => void
  /** 查看详情回调（点击卡片主体触发） */
  onView: (id: string) => void
}

/** 卡片底部展示的最大链接数 */
const FOOTER_LINK_CAP = 3

/**
 * AirdropCard — 空投项目卡片组件
 *
 * 在列表中以卡片形式展示空投项目的核心信息，包含名称、状态标签、类型标签、描述摘要、
 * 关联账号池/脚本模板、链接列表、任务数量和收益摘要。点击卡片主体进入详情页。
 *
 * @param project  - 空投项目数据
 * @param onEdit   - 编辑回调
 * @param onDelete - 删除回调
 * @param onView   - 查看详情回调
 */
const AirdropCard: React.FC<AirdropCardProps> = ({ project, onEdit, onDelete, onView }) => {
  const { t } = useTranslation()

  // 截取最多 FOOTER_LINK_CAP 个链接显示在底部
  const visibleLinks = project.links.slice(0, FOOTER_LINK_CAP)
  const hiddenLinkCount = Math.max(0, project.links.length - FOOTER_LINK_CAP)
  // 收益摘要取前 3 项展示
  const earnings = formatEarningsSummary(project.earnings).slice(0, 3)

  return (
    <div
      data-testid="airdrop-card-body"
      onClick={() => onView(project.id)}
      className={`group relative flex flex-col bg-bg-card rounded-xl border border-border-light hover:border-border-hover transition-all duration-200 cursor-pointer overflow-hidden border-l-[3px] ${statusBorderClass(project.status)}`}
    >
      {/* 顶部区域：项目名称 + 操作按钮（编辑/删除） */}
      <div className="flex items-start justify-between gap-2 px-4 pt-3.5 pb-2">
        <h3 className="font-semibold text-base text-text-primary leading-snug line-clamp-2 flex-1">
          {project.name}
        </h3>
        {/* 操作按钮组：悬停时显示 */}
        <div className="flex items-center gap-0.5 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
          <button
            data-testid="airdrop-card-edit"
            onClick={(e) => {
              e.stopPropagation()
              onEdit(project.id)
            }}
            className="p-1.5 text-text-muted hover:text-primary hover:bg-primary-light rounded transition-colors"
            aria-label={t('common.edit')}
          >
            <Edit3 size={14} />
          </button>
          <button
            data-testid="airdrop-card-delete"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(project.id)
            }}
            className="p-1.5 text-text-muted hover:text-danger hover:bg-danger-light rounded transition-colors"
            aria-label={t('common.delete')}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* 状态 + 类型徽章行 */}
      <div className="flex items-center gap-1.5 px-4 pb-2 flex-wrap">
        <span
          className={`inline-flex items-center px-2 py-0.5 text-[11px] rounded-full font-medium ${statusColorMap[project.status]}`}
        >
          {t(statusLabelKey[project.status])}
        </span>
        <span
          className={`inline-flex items-center px-2 py-0.5 text-[11px] rounded-full font-medium ${typeColorMap[project.projectType]}`}
        >
          {t(typeLabelKey[project.projectType])}
        </span>
        {project.chain && (
          <span className="inline-flex items-center px-2 py-0.5 text-[11px] rounded-full font-medium bg-bg-tertiary text-text-secondary">
            {project.chain}
          </span>
        )}
      </div>

      {/* 描述文本（最多 3 行截断） */}
      {project.description && (
        <p className="text-xs text-text-secondary px-4 pb-2.5 line-clamp-3 leading-relaxed">
          {project.description}
        </p>
      )}

      {/* 账号池 / 脚本模板元信息行 */}
      {(project.accountPool || project.scriptTemplateId) && (
        <div className="flex items-center gap-2 px-4 pb-2.5 text-[11px] text-text-muted">
          {project.accountPool && (
            <span className="inline-flex items-center gap-1">
              <Layers size={11} className="shrink-0" />
              <span className="truncate max-w-[120px]">{project.accountPool}</span>
            </span>
          )}
          {project.website && (
            <a
              href={project.website}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-0.5 text-primary hover:underline truncate max-w-[160px]"
            >
              <ExternalLink size={10} className="shrink-0" />
              {/* 从 URL 中提取域名显示 */}
              <span className="truncate">{(() => {
                try {
                  return new URL(project.website).hostname.replace(/^www\./, '')
                } catch {
                  return project.website
                }
              })()}</span>
            </a>
          )}
        </div>
      )}

      {/* 固定底部区域：链接、任务、收益摘要 */}
      <div className="mt-auto border-t border-border-light/70 px-4 py-2.5 bg-bg-card-hover/40 space-y-1.5">
        {/* 链接列表行 */}
        {project.links.length > 0 && (
          <div className="flex items-center gap-1.5 text-[11px] text-text-secondary flex-wrap">
            <LinkIcon size={11} className="text-text-muted shrink-0" />
            {visibleLinks.map((l: AirdropLink, i: number) => (
              <a
                key={i}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-bg-card border border-border-light rounded text-text-secondary hover:text-primary hover:border-primary/40 truncate max-w-[140px]"
                title={l.label || l.url}
              >
                {l.label || l.url}
              </a>
            ))}
            {/* 超出 FOOTER_LINK_CAP 的链接显示 +N */}
            {hiddenLinkCount > 0 && (
              <span className="inline-flex items-center px-1.5 py-0.5 bg-bg-card border border-border-light rounded text-text-muted">
                +{hiddenLinkCount}
              </span>
            )}
          </div>
        )}

        {/* 任务数 + 收益摘要行 */}
        <div className="flex items-center gap-3 text-[11px] text-text-secondary">
          {project.tasks.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <ListChecks size={11} className="text-text-muted" />
              <span className="font-medium">{project.tasks.length}</span>
              <span className="text-text-muted">{t('airdrops.tasks')}</span>
            </span>
          )}
          {earnings.length > 0 && (
            <span className="inline-flex items-center gap-1 truncate">
              <DollarSign size={11} className="text-text-muted" />
              <span className="font-medium">{earnings[0].amount}</span>
              <span className="text-text-muted">{earnings[0].token}</span>
              {/* 多币种时显示 +N */}
              {earnings.length > 1 && (
                <span className="text-text-muted">+{earnings.length - 1}</span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* 底部标签行（最多显示 4 个） */}
      {project.tags.length > 0 && (
        <div className="flex items-center gap-1 px-4 py-2 border-t border-border-light/40 flex-wrap">
          {project.tags.slice(0, 4).map((tag: string, i: number) => (
            <span
              key={i}
              className="inline-block px-1.5 py-0.5 text-[10px] bg-bg-tertiary text-text-muted rounded font-medium"
            >
              {tag}
            </span>
          ))}
          {project.tags.length > 4 && (
            <span className="text-[10px] text-text-muted">+{project.tags.length - 4}</span>
          )}
        </div>
      )}
    </div>
  )
}

export default AirdropCard

/**
 * @file Pagination — 分页组件
 * @description 提供上一页/下一页/页码显示的分页控件。支持两种布局：
 *              带总数文本时左右排列，不带时居中排列。
 * @module renderer/components/common
 */
import { ChevronLeft, ChevronRight } from 'lucide-react'
import React from 'react'
import { useTranslation } from 'react-i18next'

interface PaginationProps {
  /** 当前页码（从 1 开始） */
  page: number
  /** 总页数 */
  totalPages: number
  /** 上一页回调，到第一页时按钮自动禁用 */
  onPrev: () => void
  /** 下一页回调，到最后一页时按钮自动禁用 */
  onNext: () => void
  /** 总计数文本（可选，带此参数时布局变为左右排列） */
  totalCountText?: string
  /** 自定义页码显示文字（默认显示 "page / totalPages"） */
  pageText?: string
}

/**
 * Pagination — 分页组件
 *
 * 渲染简洁的上一页/下一页+页码指示器。当提供 totalCountText 时，
 * 左侧显示总计数，右侧显示翻页按钮，用于表格/列表底部的分页栏。
 *
 * @param page           - 当前页码
 * @param totalPages     - 总页数
 * @param onPrev         - 上一页回调
 * @param onNext         - 下一页回调
 * @param totalCountText - 总计数文本（可选）
 * @param pageText       - 自定义页码文本（可选）
 */
const Pagination: React.FC<PaginationProps> = ({
  page,
  totalPages,
  onPrev,
  onNext,
  totalCountText,
  pageText
}) => {
  const { t } = useTranslation()
  /** 翻页按钮共用样式 */
  const btnClass =
    'p-2 rounded-lg border border-border-light hover:bg-bg-card-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
  const textClass = 'text-sm text-text-muted min-w-[80px] text-center'

  // 带总数计数的布局：左计数 + 右翻页
  if (totalCountText) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-muted">{totalCountText}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={onPrev}
            disabled={page <= 1}
            className={btnClass}
            aria-label={t('common.previous')}
          >
            <ChevronLeft size={16} />
          </button>
          <span className={textClass}>{pageText || `${page} / ${totalPages}`}</span>
          <button
            onClick={onNext}
            disabled={page >= totalPages}
            className={btnClass}
            aria-label={t('common.next')}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    )
  }

  // 无总数计数的布局：居中显示翻页按钮
  return (
    <div className="flex items-center justify-center gap-2">
      <button
        onClick={onPrev}
        disabled={page <= 1}
        className={btnClass}
        aria-label={t('common.previous')}
      >
        <ChevronLeft size={16} />
      </button>
      <span className={textClass}>{pageText || `${page} / ${totalPages}`}</span>
      <button
        onClick={onNext}
        disabled={page >= totalPages}
        className={btnClass}
        aria-label={t('common.next')}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  )
}

export default Pagination

import { ChevronLeft, ChevronRight } from 'lucide-react'
import React from 'react'

interface PaginationProps {
  page: number
  totalPages: number
  onPrev: () => void
  onNext: () => void
  totalCountText?: string
  pageText?: string
}

const Pagination: React.FC<PaginationProps> = ({
  page,
  totalPages,
  onPrev,
  onNext,
  totalCountText,
  pageText
}) => {
  const btnClass =
    'p-2 rounded-lg border border-border-light hover:bg-bg-card-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
  const textClass = 'text-sm text-text-muted min-w-[80px] text-center'

  if (totalCountText) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-muted">{totalCountText}</span>
        <div className="flex items-center gap-2">
          <button onClick={onPrev} disabled={page <= 1} className={btnClass}>
            <ChevronLeft size={16} />
          </button>
          <span className={textClass}>{pageText || `${page} / ${totalPages}`}</span>
          <button onClick={onNext} disabled={page >= totalPages} className={btnClass}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center gap-2">
      <button onClick={onPrev} disabled={page <= 1} className={btnClass}>
        <ChevronLeft size={16} />
      </button>
      <span className={textClass}>{pageText || `${page} / ${totalPages}`}</span>
      <button onClick={onNext} disabled={page >= totalPages} className={btnClass}>
        <ChevronRight size={16} />
      </button>
    </div>
  )
}

export default Pagination

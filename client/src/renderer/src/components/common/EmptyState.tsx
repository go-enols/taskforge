/**
 * @file EmptyState — 空状态占位组件
 * @description 用于列表或数据区域无数据时的占位提示，包含图标、标题、描述和可选的操作按钮。
 *              支持紧凑模式（dense）用于较小的容器。
 * @module renderer/components/common
 */
import React from 'react'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  /** lucide-react 图标组件 */
  icon: LucideIcon
  /** 空状态标题 */
  title: string
  /** 空状态描述文本（可选） */
  description?: string
  /** 操作按钮或链接（可选） */
  action?: React.ReactNode
  /** 紧凑模式（减少内边距，默认 false） */
  dense?: boolean
}

/**
 * EmptyState — 空状态占位组件
 *
 * 渲染带虚线边框的占位卡片：渐变图标底座 + 标题 + 描述 + 可选操作。
 * 使用 role="status" 标识为状态区域。
 *
 * @param icon        - 图标组件
 * @param title       - 标题
 * @param description - 描述文本
 * @param action      - 操作元素
 * @param dense       - 紧凑模式
 */
const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  dense = false
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        dense ? 'px-4 py-4' : 'px-6 py-14'
      } rounded-xl border border-dashed border-border-light bg-bg-card/40`}
      role="status"
    >
      {/* 图标底座：带品牌色光晕的圆角方块 */}
      <div className={`relative ${dense ? 'mb-2' : 'mb-4'}`}>
        <div className="pointer-events-none absolute inset-0 rounded-2xl bg-primary/15 blur-xl" />
        <div
          className={`relative flex items-center justify-center rounded-2xl border border-border-light bg-bg-tertiary/70 shadow-sm ${
            dense ? 'h-10 w-10' : 'h-14 w-14'
          }`}
        >
          <Icon
            className={`${dense ? 'h-4 w-4' : 'h-6 w-6'} text-text-muted`}
            aria-hidden="true"
          />
        </div>
      </div>
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-text-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export default EmptyState

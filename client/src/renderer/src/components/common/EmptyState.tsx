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
 * 渲染带虚线边框的占位卡片，包含图标（圆形背景）、标题、描述和可选的操作元素。
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
        dense ? 'py-4 px-4' : 'py-12 px-6'
      } bg-bg-card/50 border border-dashed border-border-light rounded-xl`}
      role="status"
    >
      {/* 图标圆形背景容器 */}
      <div className="p-3 rounded-full bg-bg-tertiary mb-3">
        <Icon className="w-6 h-6 text-text-muted" aria-hidden="true" />
      </div>
      <h3 className="text-sm font-semibold text-text-primary mb-1">{title}</h3>
      {description && <p className="text-xs text-text-muted max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export default EmptyState

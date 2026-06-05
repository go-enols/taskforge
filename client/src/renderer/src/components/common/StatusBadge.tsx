/**
 * @file StatusBadge — 通用状态徽章组件
 * @description 根据状态值从颜色映射中选取对应样式，渲染圆角徽章。
 *              支持自定义标签和子元素（图标等）。
 * @module renderer/components/common
 */
import React from 'react'

interface StatusBadgeProps {
  /** 状态值，用于在 colorMap 中查找对应颜色 */
  status: string
  /** 状态到 Tailwind 颜色类的映射表 */
  colorMap: Record<string, string>
  /** 默认颜色（状态未匹配时使用） */
  defaultColor?: string
  /** 显示文本（不传则直接显示 status 值） */
  label?: React.ReactNode
  /** 子元素（如图标），放在标签文本前面 */
  children?: React.ReactNode
}

/**
 * StatusBadge — 通用状态徽章组件
 *
 * 根据状态值在 colorMap 中查找对应的颜色样式，渲染圆角徽章。
 * 有 children 时使用 flex 布局（图标+文字并排），否则为 inline-block。
 *
 * @param status       - 状态值
 * @param colorMap     - 颜色映射表
 * @param defaultColor - 默认颜色类
 * @param label        - 显示标签
 * @param children     - 前置子元素
 */
const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  colorMap,
  defaultColor = 'bg-status-idle-bg text-status-idle-text',
  label,
  children
}) => {
  const hasChildren = !!children
  return (
    <span
      className={`${hasChildren ? 'inline-flex items-center gap-1.5' : 'inline-block'} px-2 py-0.5 text-xs rounded-full font-medium ${colorMap[status] || defaultColor}`}
    >
      {children}
      {label ?? status}
    </span>
  )
}

export default StatusBadge

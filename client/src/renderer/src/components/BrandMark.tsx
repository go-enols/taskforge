/**
 * @file BrandMark — 品牌字标（与 LoginPage 共享 + TitleBar 复用）
 * @description 18px 极宽字距 TASKFORGE 字标 + 紫金渐变 + aurora-drift 8s 动画。
 *              在 light/dark 双主题下都可见（渐变颜色由 --color-brand-1 / --color-brand-2 主题感知）。
 *              视觉定义见 main.css 的 .brand-mark / .brand-mark__title。
 * @module renderer/components
 */
import React from 'react'

export type BrandMarkSize = 'sm' | 'md' | 'lg'

export interface BrandMarkProps {
  /** 可选副标题（11px uppercase 紫调灰） */
  subtitle?: string
  /** 字标尺寸：sm=12px / md=18px（默认）/ lg=24px */
  size?: BrandMarkSize
  /** 根元素追加 className */
  className?: string
  /** aria-label（默认 "TaskForge"） */
  'aria-label'?: string
}

const sizeClassMap: Record<BrandMarkSize, string> = {
  sm: 'brand-mark__title--sm',
  md: '',
  lg: 'brand-mark__title--lg'
}

const BrandMark: React.FC<BrandMarkProps> = ({
  subtitle,
  size = 'md',
  className = '',
  'aria-label': ariaLabel = 'TaskForge'
}) => {
  const sizeClass = sizeClassMap[size]
  return (
    <div className={`brand-mark ${className}`.trim()} role="img" aria-label={ariaLabel}>
      <div className={`brand-mark__title ${sizeClass}`.trim()}>TASKFORGE</div>
      {subtitle && <div className="brand-mark__subtitle">{subtitle}</div>}
    </div>
  )
}

export default BrandMark

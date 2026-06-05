/**
 * @file Skeleton — 骨架屏组件
 * @description 用于数据加载期间的占位效果，支持单行和多行模式。
 *              最后一行宽度为 60%，模拟文本的自然长度变化。
 * @module renderer/components/common
 */
import React from 'react'

interface SkeletonProps {
  /** 自定义 CSS 类名 */
  className?: string
  /** 模拟的行数（默认 1） */
  lines?: number
}

/**
 * Skeleton — 骨架屏加载占位组件
 *
 * 单行模式渲染一个脉冲动画方块，多行模式渲染堆叠的行，
 * 最后一行自动缩窄到 60% 以模拟文本行。
 * 设置 aria-hidden="true" 对屏幕阅读器隐藏。
 *
 * @param className - 自定义类名
 * @param lines     - 模拟行数
 */
const Skeleton: React.FC<SkeletonProps> = ({ className = '', lines = 1 }) => {
  if (lines === 1) {
    return (
      <div
        className={`animate-pulse-skeleton rounded bg-bg-tertiary ${className}`}
        aria-hidden="true"
      />
    )
  }

  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`animate-pulse-skeleton rounded bg-bg-tertiary ${className}`}
          // 最后一行缩窄到 60% 模拟文本行
          style={{ width: i === lines - 1 ? '60%' : '100%' }}
        />
      ))}
    </div>
  )
}

export default Skeleton

/**
 * @file StaggeredFadeIn — 错落淡入动画组件
 * @description 将子元素逐个淡入，每个子元素之间可配置延迟间隔。
 *              通过 CSS 自定义属性 --stagger-delay 控制各元素的动画延迟。
 * @module renderer/components/common
 */
import React from 'react'

interface StaggeredFadeInProps {
  /** 子元素列表 */
  children: React.ReactNode
  /** 每个子元素之间的延迟步长（毫秒，默认 40） */
  delayStep?: number
  /** 容器自定义类名 */
  className?: string
  /** 容器 HTML 标签（默认 'div'） */
  as?: keyof React.JSX.IntrinsicElements
}

/**
 * StaggeredFadeIn — 错落淡入动画组件
 *
 * 将子元素列表逐个以淡入动画显示，每个元素比上一个延迟 delayStep 毫秒。
 * 依赖于 CSS 类 stagger-fade 和 stagger-item 定义的动画效果。
 * 使用 --stagger-delay CSS 自定义属性传递延迟值。
 *
 * @param children  - 子元素
 * @param delayStep - 延迟步长（ms）
 * @param className - 容器类名
 * @param as        - 容器标签
 */
const StaggeredFadeIn: React.FC<StaggeredFadeInProps> = ({
  children,
  delayStep = 40,
  className = '',
  as: Tag = 'div'
}) => {
  const items = React.Children.toArray(children)
  return (
    <Tag className={`stagger-fade ${className}`}>
      {items.map((child, idx) => (
        <div
          key={(child as React.ReactElement)?.key ?? idx}
          className="stagger-item"
          // 通过 CSS 自定义属性传递各元素的动画延迟时间
          style={{ ['--stagger-delay' as string]: `${idx * delayStep}ms` }}
        >
          {child}
        </div>
      ))}
    </Tag>
  )
}

export default StaggeredFadeIn

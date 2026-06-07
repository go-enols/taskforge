/**
 * @file Modal — 通用模态框组件
 * @description 提供基础的模态框容器，支持打开/关闭、Escape 键关闭、背景遮罩点击关闭、
 *              可配置最大宽度和滚动行为。打开时锁定 body 滚动。
 *              内部使用 React Portal 渲染到 document.body，绕过任何祖先 stacking context
 *              （transform/filter/perspective 等）的影响，确保遮罩铺满整个视口。
 * @module renderer/components/common
 */
import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  /** 是否打开模态框 */
  open: boolean
  /** 关闭回调 */
  onClose: () => void
  /** 模态框标题 */
  title: string
  /** 模态框内容子组件 */
  children: React.ReactNode
  /** 最大宽度 Tailwind 类（默认 max-w-md） */
  maxWidth?: string
  /** 内容超出时是否可滚动（默认 true） */
  scrollable?: boolean
}

/**
 * Modal — 通用模态框组件
 *
 * 提供带有半透明背景遮罩的模态对话框，支持键盘（Escape）和点击遮罩关闭。
 * 打开时阻止 body 滚动，关闭时恢复。
 * 通过 React Portal 渲染到 document.body，避免被任何祖先容器的 stacking context 限制。
 *
 * @param open      - 是否显示
 * @param onClose   - 关闭回调
 * @param title     - 标题
 * @param children  - 内容
 * @param maxWidth  - 最大宽度
 * @param scrollable - 是否允许滚动
 */
const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  children,
  maxWidth = 'max-w-md',
  scrollable = true
}) => {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      ref.current?.focus()
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  if (!open) return null

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-modal-enter"
      role="dialog"
      aria-modal="true"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      ref={ref}
      tabIndex={-1}
    >
      {/* 半透明背景遮罩：使用 z-0 让其位于面板之下、fixed 容器之内 */}
      <div
        className="absolute inset-0 z-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* 模态框面板：z-10 位于遮罩之上 */}
      <div
        className={`modal-panel relative z-10 bg-bg-card rounded-xl shadow-xl ring-1 ring-border-light p-6 w-full ${maxWidth} ${scrollable ? 'max-h-[90vh] overflow-y-auto' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-text-primary mb-4">{title}</h2>
        {children}
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}

export default Modal

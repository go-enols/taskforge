/**
 * @file ConfirmDialog — 确认对话框组件
 * @description 基于 Modal 组件的确认/删除对话框，支持危险操作（红色按钮）和加载状态。
 *              用于删除操作或需要用户确认的关键操作。
 * @module renderer/components/common
 */
import React from 'react'
import Modal from './Modal'

interface ConfirmDialogProps {
  /** 是否打开 */
  open: boolean
  /** 关闭回调 */
  onClose: () => void
  /** 确认操作回调 */
  onConfirm: () => void
  /** 对话框标题 */
  title: string
  /** 确认提示消息 */
  message: string
  /** 确认按钮文本（默认 "Delete"） */
  confirmText?: string
  /** 取消按钮文本（默认 "Cancel"） */
  cancelText?: string
  /** 是否为危险操作（红色按钮，默认 true） */
  danger?: boolean
  /** 确认操作加载中（禁用按钮并显示 "..."） */
  loading?: boolean
}

/**
 * ConfirmDialog — 确认对话框组件
 *
 * 基于 Modal 构建，提供取消和确认两个按钮。danger 模式使用红色主题。
 * 用于删除确认、危险操作确认等场景。
 *
 * @param open        - 是否显示
 * @param onClose     - 关闭回调
 * @param onConfirm   - 确认回调
 * @param title       - 标题
 * @param message     - 提示消息
 * @param confirmText - 确认按钮文本
 * @param cancelText  - 取消按钮文本
 * @param danger      - 危险模式（红色按钮）
 * @param loading     - 加载中状态
 */
const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  danger = true,
  loading = false
}) => {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-sm">
      <p className="text-sm text-text-secondary mb-6">{message}</p>
      <div className="flex justify-end gap-2">
        {/* 取消按钮 */}
        <button
          onClick={onClose}
          className="px-4 py-1.5 text-sm border border-border-light hover:bg-bg-card-hover rounded-lg transition-colors"
        >
          {cancelText}
        </button>
        {/* 确认按钮：danger 模式为红色，否则为 primary 色 */}
        <button
          onClick={onConfirm}
          disabled={loading}
          className={`px-4 py-1.5 text-sm text-white rounded-lg disabled:opacity-50 transition-colors ${danger ? 'bg-danger hover:bg-danger-hover' : 'bg-primary hover:bg-primary-hover'}`}
        >
          {loading ? '...' : confirmText}
        </button>
      </div>
    </Modal>
  )
}

export default ConfirmDialog

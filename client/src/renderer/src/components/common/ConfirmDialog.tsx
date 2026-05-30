import React from 'react'
import Modal from './Modal'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  loading?: boolean
}

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
        <button
          onClick={onClose}
          className="px-4 py-1.5 text-sm border border-border-light hover:bg-bg-card-hover rounded-lg transition-colors"
        >
          {cancelText}
        </button>
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

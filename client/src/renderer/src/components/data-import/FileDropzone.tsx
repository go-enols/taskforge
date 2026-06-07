/**
 * @file FileDropzone — 文件拖拽/选择/粘贴组件
 * @module renderer/components/data-import
 */

import { useState, useCallback, useRef, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, FileText, X, ClipboardPaste } from 'lucide-react'

export interface FileInfo {
  name: string
  size: number
  type: 'file' | 'paste'
}

interface FileDropzoneProps {
  onFileContent: (content: string, fileName: string) => void
  onClear: () => void
  currentFile: FileInfo | null
  error: string | null
  acceptExtensions?: string[]
}

/**
 * Formats bytes to a human-readable string.
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * FileDropzone — 支持拖拽 + 点击选择 + 粘贴 JSON 文本
 */
export default function FileDropzone({
  onFileContent,
  onClear,
  currentFile,
  error,
  acceptExtensions = ['.csv', '.json', '.txt']
}: FileDropzoneProps): React.ReactElement {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [showPasteInput, setShowPasteInput] = useState(false)

  const processFile = useCallback(
    (file: File) => {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase()
      if (!acceptExtensions.includes(ext) && !acceptExtensions.includes('.*')) {
        onFileContent('', '')
        return
      }

      const reader = new FileReader()
      reader.onload = () => {
        const content = reader.result as string
        onFileContent(content, file.name)
      }
      reader.onerror = () => {
        onFileContent('', '')
      }
      reader.readAsText(file)
    },
    [onFileContent, acceptExtensions]
  )

  /* ── Drag & Drop handlers ── */
  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      const files = e.dataTransfer.files
      if (files.length > 0) {
        processFile(files[0])
      }
    },
    [processFile]
  )

  /* ── Click to select handler ── */
  const handleClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0) {
        processFile(files[0])
      }
      // Reset so same file can be selected again
      e.target.value = ''
    },
    [processFile]
  )

  /* ── Paste handler ── */
  const handlePasteClick = useCallback(() => {
    setShowPasteInput(true)
  }, [])

  const handlePasteSubmit = useCallback(() => {
    if (pasteText.trim()) {
      onFileContent(pasteText.trim(), '粘贴输入')
      setPasteText('')
      setShowPasteInput(false)
    }
  }, [pasteText, onFileContent])

  const handlePasteCancel = useCallback(() => {
    setPasteText('')
    setShowPasteInput(false)
  }, [])

  const handlePasteKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        handlePasteSubmit()
      }
    },
    [handlePasteSubmit]
  )

  /* ── Clear handler ── */
  const handleClear = useCallback(() => {
    onClear()
    setPasteText('')
    setShowPasteInput(false)
  }, [onClear])

  return (
    <div className="space-y-3">
      {/* ── Drop zone ── */}
      {!currentFile && !showPasteInput && (
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={handleClick}
          className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            isDragOver
              ? 'border-primary bg-primary/5'
              : 'border-border-light bg-bg-page hover:border-primary/50 hover:bg-primary/5'
          } ${error ? 'border-red-400 bg-red-50' : ''}`}
        >
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            accept={acceptExtensions.join(',')}
            className="hidden"
            aria-label="选择文件"
          />

          <Upload size={32} className="mx-auto mb-3 text-text-muted" />
          <p className="text-sm text-text-secondary font-medium">
            {t('data.import.dropzoneHint')}
          </p>
          <p className="text-xs text-text-muted mt-1">
            {t('data.import.supportedFormats', { formats: acceptExtensions.join(', ') })}
          </p>

          {/* ── Paste button ── */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handlePasteClick()
            }}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-muted hover:text-primary bg-bg-card border border-border-light rounded-lg hover:border-primary/50 transition-colors"
          >
            <ClipboardPaste size={14} />
            {t('data.import.pasteJSON')}
          </button>
        </div>
      )}

      {/* ── Paste input area ── */}
      {showPasteInput && !currentFile && (
        <div className="bg-bg-card border border-border-light rounded-xl p-4 space-y-3">
          <label className="block text-sm font-medium text-text-primary">
            {t('data.import.pasteJSON')}
          </label>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            onKeyDown={handlePasteKeyDown}
            placeholder='[{"key": "value"}] 或 CSV 数据...'
            className="w-full h-40 px-3 py-2 text-sm bg-bg-page border border-border-light rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 text-text-primary"
            autoFocus
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePasteSubmit}
              disabled={!pasteText.trim()}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('data.import.parse')}
            </button>
            <button
              type="button"
              onClick={handlePasteCancel}
              className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
            >
              {t('data.import.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* ── File info bar ── */}
      {currentFile && (
        <div className="flex items-center gap-3 px-4 py-3 bg-bg-card border border-border-light rounded-lg">
          <FileText size={18} className="text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">{currentFile.name}</p>
            <p className="text-xs text-text-muted">
              {currentFile.type === 'file' ? formatSize(currentFile.size) : t('data.import.pastedText')}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1 px-2 py-1 text-xs text-text-muted hover:text-red-500 rounded transition-colors"
            title="清除"
          >
            <X size={14} />
            {t('data.import.clear')}
          </button>
        </div>
      )}

      {/* ── Error display ── */}
      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
    </div>
  )
}

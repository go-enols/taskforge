/**
 * @file MarkdownEditor — Markdown 编辑器 (textarea + 预览 tab 切换)
 * @description 提供"编辑 / 预览"双 tab 切换, 编辑模式使用 textarea,
 *              预览模式用 MarkdownView 渲染。所有 HTML 通过 rehype-sanitize
 *              过滤, 防止 XSS。
 *
 * 适用场景: 项目描述、脚本 changelog、模板说明 等长文本字段。
 *
 * @module renderer/components
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, Edit3, Type } from 'lucide-react'
import MarkdownView from './MarkdownView'

interface MarkdownEditorProps {
  /** 当前 Markdown 文本 */
  value: string
  /** 内容变化回调 */
  onChange: (next: string) => void
  /** 占位文本 */
  placeholder?: string
  /** 编辑器行数 (默认 6) */
  rows?: number
  /** 额外类名 */
  className?: string
  /** 是否禁用 (true: 只读预览模式, 不显示 tab) */
  disabled?: boolean
}

/**
 * MarkdownEditor — 双 tab Markdown 编辑器
 */
/* eslint-disable react/prop-types -- TypeScript types satisfy, rule has false positive on optional chaining */
const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value,
  onChange,
  placeholder,
  rows = 6,
  className = '',
  disabled = false
}) => {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')

  // 只读模式直接渲染 MarkdownView, 不显示 tab 切换
  if (disabled) {
    if (!value?.trim()) {
      return (
        <div className="text-xs text-text-muted italic">—</div>
      )
    }
    return <MarkdownView content={value} />
  }

  return (
    <div className={`border border-border-light rounded-lg overflow-hidden ${className}`}>
      {/* Tab 栏 */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-bg-tertiary/50 border-b border-border-light">
        <button
          type="button"
          onClick={() => setMode('edit')}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
            mode === 'edit'
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          <Edit3 size={12} />
          {t('markdownEditor.edit')}
        </button>
        <button
          type="button"
          onClick={() => setMode('preview')}
          disabled={!value?.trim()}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors disabled:opacity-40 ${
            mode === 'preview'
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          <Eye size={12} />
          {t('markdownEditor.preview')}
        </button>
        <div className="flex-1" />
        <span className="text-[10px] text-text-muted flex items-center gap-0.5">
          <Type size={10} />
          {t('markdownEditor.markdownSupported')}
        </span>
      </div>

      {/* 内容区 */}
      {mode === 'edit' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="w-full px-3 py-2 text-sm bg-bg-card focus:outline-none focus:ring-0 resize-y font-mono leading-relaxed"
        />
      ) : value?.trim() ? (
        <div className="px-3 py-2 bg-bg-card min-h-[6rem]">
          <MarkdownView content={value} />
        </div>
      ) : (
        <div className="px-3 py-6 text-center text-xs text-text-muted italic bg-bg-card">
          {t('markdownEditor.empty')}
        </div>
      )}
    </div>
  )
}

export default MarkdownEditor

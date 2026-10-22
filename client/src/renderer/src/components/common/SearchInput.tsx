/**
 * @file SearchInput — 搜索输入框组件
 * @description 带搜索图标的文本输入框，支持自定义占位文本、无障碍标签和样式类。
 *              输入非空时显示一键清空按钮。用于列表/表格的搜索过滤功能。
 * @module renderer/components/common
 */
import { Search, X } from 'lucide-react'
import React from 'react'

interface SearchInputProps {
  /** 搜索框当前值 */
  value: string
  /** 值变化回调 */
  onChange: (value: string) => void
  /** 占位文本 */
  placeholder?: string
  /** 无障碍标签（默认使用 placeholder） */
  ariaLabel?: string
  /** 外层容器自定义类名 */
  className?: string
  /** 输入框自定义类名 */
  inputClassName?: string
}

/**
 * SearchInput — 搜索输入框组件
 *
 * 渲染带左侧搜索图标的文本输入框，输入内容后右侧出现清空按钮。
 *
 * @param value          - 当前值
 * @param onChange       - 值变化回调
 * @param placeholder    - 占位文本
 * @param ariaLabel      - 无障碍标签
 * @param className      - 容器类名
 * @param inputClassName - 输入框类名
 */
const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className = '',
  inputClassName = 'w-64 rounded-lg border border-border-light bg-bg-card py-2 pl-9 pr-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/30'
}) => {
  return (
    <div className={`relative ${className}`}>
      {/* 搜索图标 */}
      <Search
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
        aria-hidden="true"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        className={`${inputClassName} ${value ? 'pr-9' : ''}`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={`Clear ${placeholder ?? ''}`.trim()}
          className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}

export default SearchInput

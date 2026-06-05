/**
 * @file SearchInput — 搜索输入框组件
 * @description 带搜索图标的文本输入框，支持自定义占位文本、无障碍标签和样式类。
 *              用于列表/表格的搜索过滤功能。
 * @module renderer/components/common
 */
import { Search } from 'lucide-react'
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
 * 渲染带左侧搜索图标的文本输入框，用于内容搜索过滤。
 * 图标固定在输入框左侧，输入框本身通过 padding-left 避让图标。
 *
 * @param value         - 当前值
 * @param onChange      - 值变化回调
 * @param placeholder   - 占位文本
 * @param ariaLabel     - 无障碍标签
 * @param className     - 容器类名
 * @param inputClassName - 输入框类名
 */
const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className = '',
  inputClassName = 'pl-9 pr-3 py-2 text-sm border border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary w-64 bg-bg-card'
}) => {
  return (
    <div className={`relative ${className}`}>
      {/* 搜索图标 */}
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        className={inputClassName}
      />
    </div>
  )
}

export default SearchInput

/**
 * @file logViewer.constants — 日志查看器样式与级别常量
 * @description 定义日志级别的颜色映射、级别列表和 i18n key 映射。
 *              与 Tasks.tsx 保持一致，确保同一级别在应用中颜色统一。
 *              独立文件以便 LogViewer.tsx 满足 react-refresh 的 single-export 约束。
 * @module renderer/components/common
 */
import type { TaskLogLevel } from '../../../../shared/types'

/**
 * 日志级别到颜色类的规范映射
 *
 * 与 Tasks.tsx 保持一致，确保同一级别在全应用中颜色统一。
 * 注意：DebugPage 曾有过不同的调色板（info 使用 text-text-secondary / 灰色而非
 * text-success / 绿色），那是旧版的一处疏忽，此处统一使用规范映射。
 *
 * 从独立文件导出的原因：使 LogViewer.tsx（本模块唯一的 React 组件）
 * 满足 react-refresh/only-export-components ESLint 规则（组件文件只能导出组件）。
 */
export const LOG_LEVEL_STYLES: Record<TaskLogLevel, string> = {
  info: 'text-success',
  warn: 'text-warning',
  error: 'text-danger',
  debug: 'text-text-muted'
}

/** 所有日志级别列表 */
export const LOG_LEVELS: TaskLogLevel[] = ['info', 'warn', 'error', 'debug']

/** 日志级别到 i18n label key 的映射 */
export const LEVEL_LABEL_KEY: Record<TaskLogLevel, string> = {
  info: 'tasks.logFilter.info',
  warn: 'tasks.logFilter.warn',
  error: 'tasks.logFilter.error',
  debug: 'tasks.logFilter.debug'
}

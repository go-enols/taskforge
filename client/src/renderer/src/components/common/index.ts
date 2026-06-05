/**
 * @file common/index — 公共组件统一导出入口
 * @description 集中导出 common 目录下所有公共 UI 组件，方便外部引用。
 *              同时导出 DynamicForm 作为公共表单组件的一部分。
 * @module renderer/components/common
 */
export { default as Pagination } from './Pagination'
export { default as SearchInput } from './SearchInput'
export { default as StatusBadge } from './StatusBadge'
export { default as Modal } from './Modal'
export { default as ConfirmDialog } from './ConfirmDialog'
export { default as Skeleton } from './Skeleton'
export { default as EmptyState } from './EmptyState'
export { default as StaggeredFadeIn } from './StaggeredFadeIn'
export { default as LogViewer } from './LogViewer'
export { default as DynamicForm } from '../DynamicForm'

/**
 * @file ErrorBoundary — React 错误边界
 * @description 捕获子组件树中的渲染错误，展示友好错误页面并提供"重新加载"按钮。
 *              避免整个应用因局部错误而白屏。
 * @module renderer/components
 */
import React from 'react'

interface ErrorBoundaryState {
  /** 是否发生错误 */
  hasError: boolean
  /** 捕获到的错误对象 */
  error: Error | null
}

interface ErrorBoundaryProps {
  /** 子组件树 */
  children: React.ReactNode
}

/**
 * ErrorBoundary — React 错误边界组件
 *
 * 使用 React 生命周期方法 getDerivedStateFromError 和 componentDidCatch
 * 捕获子组件中的渲染错误，显示错误详情和"重新加载"按钮。
 *
 * @example
 * ```tsx
 * <ErrorBoundary>
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  /** React 生命周期：捕获错误并更新状态触发降级 UI */
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  /** 错误上报：将错误信息输出到控制台 */
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary]', error, errorInfo.componentStack)
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      const stack = this.state.error?.stack ?? this.state.error?.message ?? 'Unknown error'
      return (
        // 错误降级 UI：全屏居中显示错误详情
        <div className="h-screen flex items-center justify-center bg-bg-page p-8">
          <div className="max-w-lg w-full bg-bg-card border border-border rounded-lg p-6 text-center">
            <h1 className="text-xl font-semibold text-text-primary mb-3">Something went wrong</h1>
            <pre className="text-sm text-text-muted bg-bg-page rounded p-3 mb-4 overflow-auto max-h-48 text-left whitespace-pre-wrap break-all">
              {stack}
            </pre>
            <button
              className="px-4 py-2 bg-primary text-white rounded hover:opacity-90 transition-opacity"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    // 无错误时正常渲染子组件
    return this.props.children
  }
}

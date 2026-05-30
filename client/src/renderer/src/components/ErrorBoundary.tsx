import React from 'react'

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

interface ErrorBoundaryProps {
  children: React.ReactNode
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary]', error, errorInfo.componentStack)
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      const stack = this.state.error?.stack ?? this.state.error?.message ?? 'Unknown error'
      return (
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
    return this.props.children
  }
}

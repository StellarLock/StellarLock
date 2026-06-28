import { Component, type ErrorInfo, type ReactNode } from "react"

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App error:", error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
          <h1 className="text-xl font-bold text-destructive">Something went wrong</h1>
          <pre className="max-w-xl overflow-auto rounded-lg border border-border bg-card p-4 text-left text-xs text-muted-foreground">
            {/* Avoid leaking internal error details (RPC/Soroban/stack traces) */}
            Something went wrong. Please try again.
          </pre>
          <button
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

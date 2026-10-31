import { Component, type ReactNode } from 'react'

/** If any screen crashes, show a friendly recovery screen instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-5xl">🛠️</p>
        <p className="text-xl font-extrabold">Something went wrong</p>
        <p className="text-sm text-slate-400">Your money and data are safe. This screen had a problem loading.</p>
        <div className="mt-2 flex gap-2">
          <button className="btn-ghost" onClick={() => { this.setState({ error: null }); history.back() }}>Go back</button>
          <button className="btn-primary" onClick={() => location.reload()}>Reload Luda</button>
        </div>
      </div>
    )
  }
}

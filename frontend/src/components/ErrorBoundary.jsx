import { Component } from 'react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-5 font-sans">
          <div className="max-w-[480px] w-full bg-card border border-border rounded-xl shadow-sm p-8 text-center">
            <h1 className="text-[22px] font-semibold text-foreground mb-3">
              Something went wrong
            </h1>
            <p className="text-sm text-muted-foreground mb-6">
              The application encountered an unexpected error. Try reloading the page.
            </p>
            {this.state.error?.message && (
              <pre className="bg-muted text-muted-foreground text-left text-xs rounded-md p-3 overflow-auto max-h-40 mb-5">
                {String(this.state.error.message)}
              </pre>
            )}
            <button
              onClick={this.handleReload}
              className="bg-primary text-primary-foreground border-none rounded-md px-5 py-2.5 text-sm font-medium cursor-pointer hover:bg-primary/90 transition-colors"
            >
              Reload page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

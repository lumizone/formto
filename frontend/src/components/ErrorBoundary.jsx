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
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          padding: '20px',
          background: '#f9fafb',
        }}>
          <div style={{
            maxWidth: '480px',
            background: '#fff',
            padding: '32px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,.1)',
            textAlign: 'center',
          }}>
            <h1 style={{ fontSize: '22px', fontWeight: 600, margin: '0 0 12px', color: '#111827' }}>
              Something went wrong
            </h1>
            <p style={{ color: '#6b7280', fontSize: '14px', margin: '0 0 24px' }}>
              The application encountered an unexpected error. Try reloading the page.
            </p>
            {this.state.error?.message && (
              <pre style={{
                background: '#f3f4f6',
                padding: '12px',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#374151',
                textAlign: 'left',
                overflow: 'auto',
                maxHeight: '160px',
                margin: '0 0 20px',
              }}>
                {String(this.state.error.message)}
              </pre>
            )}
            <button
              onClick={this.handleReload}
              style={{
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
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

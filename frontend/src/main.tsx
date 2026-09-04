import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { AccessProvider } from './context/AccessContext'
import { captureError, initObservability } from './observability'
import './index.css'
import App from './App.tsx'

class RootErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) { return { error }; }
  componentDidCatch(error: unknown, info: unknown) { captureError(error, { info }); }
  render() {
    if (this.state.error) {
      return (
        <div role="alert" style={{ padding: 24, fontFamily: 'sans-serif' }}>
          <h1>Something went wrong.</h1>
          <p>Reload the page to try again.</p>
          <button onClick={() => window.location.reload()}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

initObservability();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <BrowserRouter>
        <AccessProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </AccessProvider>
      </BrowserRouter>
    </RootErrorBoundary>
  </StrictMode>,
)

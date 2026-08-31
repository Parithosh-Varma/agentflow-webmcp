import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { AccessProvider } from './context/AccessContext'
import { initObservability } from './observability'
import './index.css'
import App from './App.tsx'

initObservability();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AccessProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </AccessProvider>
    </BrowserRouter>
  </StrictMode>,
)

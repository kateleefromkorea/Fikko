import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import { PlanProvider } from './hooks/usePlan'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'
// Catches the browser's install offer before React starts (it fires only once).
import './lib/install'

// After a new deploy, a page that was already open asks for code files that no
// longer exist (e.g. the Dashboard, opened right after onboarding). Reload once
// to pick up the new version instead of crashing; the timestamp stops a loop.
window.addEventListener('vite:preloadError', (event) => {
  const key = 'fikko-reloaded-for-update'
  let last = 0
  try { last = Number(sessionStorage.getItem(key)) || 0 } catch { /* storage blocked */ }
  if (Date.now() - last < 10_000) return
  try { sessionStorage.setItem(key, String(Date.now())) } catch { /* storage blocked */ }
  event.preventDefault()
  window.location.reload()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <PlanProvider>
          <App />
        </PlanProvider>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
  })
}

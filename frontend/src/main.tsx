import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ConnectCallback } from './components/ConnectCallback.tsx'
import { EvalsDashboard } from './evals/EvalsDashboard.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Live prices arrive separately via Supabase Realtime — these queries
      // just need to stay reasonably fresh against manual actions (a new
      // transaction, a new recurring rule) made elsewhere.
      staleTime: 15_000,
      refetchOnWindowFocus: true,
    },
  },
})

// No router — the app only has a few real "pages" (the dashboard, the Angel
// One Publisher Login redirect landing, and the read-only eval harness
// dashboard), so a pathname switch is simpler than pulling in a routing
// library. /evals is a standalone, auth-free view of the eval_* tables.
const path = window.location.pathname

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {path === '/connect/callback' ? (
        <ConnectCallback />
      ) : path === '/evals' ? (
        <EvalsDashboard />
      ) : (
        <App />
      )}
    </QueryClientProvider>
  </StrictMode>,
)

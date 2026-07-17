import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ConnectCallback } from './components/ConnectCallback.tsx'

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

// No router — the app only ever has two real "pages" (the dashboard, and
// this one-shot landing point for Angel One's Publisher Login redirect), so
// a single pathname check is simpler than pulling in a routing library for
// one conditional split.
const isConnectCallback = window.location.pathname === '/connect/callback'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {isConnectCallback ? <ConnectCallback /> : <App />}
    </QueryClientProvider>
  </StrictMode>,
)

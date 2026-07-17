import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export type BrokerSessionStatus = {
  connected: boolean
  // A row exists but expires_at has passed — distinct from never having
  // connected at all (Step 8: "reconnect" copy vs. the generic pitch).
  expired: boolean
  clientCode: string | null
  loading: boolean
}

const EMPTY_STATUS: Omit<BrokerSessionStatus, 'loading'> = { connected: false, expired: false, clientCode: null }

// Connection status only (never tokens) — re-checked on every mount rather
// than cached from connect-time, since that's the only reliable way to
// reflect reality across separate page loads (no client-side router) and to
// naturally fall back to demo once a session expires (Step 8).
export function useBrokerSession(): BrokerSessionStatus {
  const { user, accessToken, loading: authLoading } = useAuth()
  const [status, setStatus] = useState<Omit<BrokerSessionStatus, 'loading'>>(EMPTY_STATUS)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!user || !accessToken) {
      setStatus(EMPTY_STATUS)
      setChecked(true)
      return
    }

    let cancelled = false
    fetch(`${SUPABASE_URL}/functions/v1/get-broker-session`, {
      headers: { Authorization: `Bearer ${accessToken}`, apikey: SUPABASE_ANON_KEY },
    })
      .then((res) => (res.ok ? res.json() : EMPTY_STATUS))
      .then((data) => {
        if (cancelled) return
        setStatus({
          connected: Boolean(data.connected),
          expired: Boolean(data.expired),
          clientCode: data.client_code ?? null,
        })
      })
      .catch(() => {
        if (!cancelled) setStatus(EMPTY_STATUS)
      })
      .finally(() => {
        if (!cancelled) setChecked(true)
      })

    return () => {
      cancelled = true
    }
  }, [user, accessToken, authLoading])

  return { ...status, loading: authLoading || !checked }
}

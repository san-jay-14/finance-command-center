import { useEffect } from 'react'
import { useBrokerSession } from './useBrokerSession'
import { useModeStore } from '../store/modeStore'

// The single source of truth for switching to live mode. Mode is not set
// once at connect-time and left alone — ConnectCallback and the dashboard
// are separate page loads with no persisted mode state (no router), so
// live mode only ever exists because this re-derives it, on every load,
// from whether the signed-in user actually has a valid broker session.
// Same mechanism naturally handles Step 8's expiry fallback: an expired
// session just fails the check and mode resolves to demo.
export function useModeSync(): void {
  const { connected, loading } = useBrokerSession()
  const setMode = useModeStore((s) => s.setMode)

  useEffect(() => {
    if (loading) return
    setMode(connected ? 'live' : 'demo')
  }, [connected, loading, setMode])
}

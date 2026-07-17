import { useEffect, useRef, useState } from 'react'
import { consumeStoredConnectState } from '../lib/angelOneConnect'

type CapturedTokens = { authToken: string; feedToken: string; refreshToken: string | null }

// Landing point for Angel One's Publisher Login redirect (mounted directly
// from main.tsx when pathname is /connect/callback, bypassing the normal
// App tree entirely). Step 5 scope only: confirms the round trip works and
// tokens arrive — it does not persist anything (Step 6: broker_sessions via
// Vault) or flip the app to live mode (Step 7). Demo mode elsewhere is
// completely unaffected by this route existing.
export function ConnectCallback() {
  const [tokens, setTokens] = useState<CapturedTokens | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The effect below mutates the URL (strips tokens via replaceState), so it
  // must only truly run once — StrictMode's dev-only double-invoke would
  // otherwise have the second pass read an already-cleared query string and
  // overwrite a real success with a false "no tokens" error.
  const hasRun = useRef(false)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    const params = new URLSearchParams(window.location.search)
    const authToken = params.get('auth_token')
    const feedToken = params.get('feed_token')
    const refreshToken = params.get('refresh_token')
    const returnedState = params.get('state')

    const expectedState = consumeStoredConnectState()
    if (expectedState && returnedState && expectedState !== returnedState) {
      console.warn('Angel One connect: state mismatch on callback — possible CSRF or stale session')
    } else if (!returnedState) {
      // Documented SmartAPI forum issue: state is sometimes not echoed back
      // on this callback at all. Not treated as fatal.
      console.warn('Angel One connect: no state param returned on callback (known SmartAPI quirk)')
    }

    if (!authToken || !feedToken) {
      setError('No tokens were returned. The connect attempt may have failed or been cancelled.')
      return
    }

    setTokens({ authToken, feedToken, refreshToken })

    // Scrub tokens out of the URL/history immediately — no reason for them
    // to linger in the address bar or browser history any longer than the
    // instant it took to read them.
    window.history.replaceState({}, '', '/connect/callback')
  }, [])

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-page px-6 text-center font-body text-ink">
      {error ? (
        <>
          <div className="text-lg font-semibold text-loss">Connect failed</div>
          <div className="max-w-sm text-sm text-ink-soft">{error}</div>
        </>
      ) : tokens ? (
        <>
          <div className="gain-text text-lg font-semibold">Tokens received</div>
          <div className="max-w-sm text-sm text-ink-soft">
            Angel One returned an auth token and feed token successfully. Storing this session and
            switching to live mode are wired up in later steps — for now this just confirms the
            round trip works end-to-end.
          </div>
        </>
      ) : (
        <div className="text-sm text-ink-faint">Connecting…</div>
      )}
      <a href="/" className="text-sm text-primary-start hover:underline">
        Back to dashboard
      </a>
    </div>
  )
}

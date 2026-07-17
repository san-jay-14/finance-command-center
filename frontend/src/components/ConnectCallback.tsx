import { useEffect, useRef, useState } from 'react'
import { consumeStoredConnectState, tryExtractClientCode } from '../lib/angelOneConnect'
import { connectBrokerSession } from '../lib/brokerConnect'

type Status =
  | { phase: 'connecting' }
  | { phase: 'storing' }
  | { phase: 'success' }
  | { phase: 'error'; message: string }

// Landing point for Angel One's Publisher Login redirect (mounted directly
// from main.tsx when pathname is /connect/callback, bypassing the normal
// App tree entirely). Captures auth_token/feed_token/refresh_token, then
// persists them into broker_sessions via Vault (Step 6, connectBrokerSession
// -> connect-broker-session edge function). Does NOT flip the app to live
// mode yet — that's Step 7. Demo mode elsewhere is completely unaffected by
// this route existing.
export function ConnectCallback() {
  const [status, setStatus] = useState<Status>({ phase: 'connecting' })
  // The effect below mutates the URL (strips tokens via replaceState) and
  // kicks off a network write, so it must only truly run once — StrictMode's
  // dev-only double-invoke would otherwise re-read an already-cleared query
  // string and/or double-submit the write.
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

    // Scrub tokens out of the URL/history immediately, before any async
    // work — no reason for them to linger in the address bar or browser
    // history any longer than the instant it took to read them.
    window.history.replaceState({}, '', '/connect/callback')

    if (!authToken || !feedToken) {
      setStatus({ phase: 'error', message: 'No tokens were returned. The connect attempt may have failed or been cancelled.' })
      return
    }

    setStatus({ phase: 'storing' })
    connectBrokerSession({
      authToken,
      feedToken,
      refreshToken,
      clientCode: tryExtractClientCode(authToken),
    }).then((result) => {
      setStatus(result.ok ? { phase: 'success' } : { phase: 'error', message: result.error })
    })
  }, [])

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-page px-6 text-center font-body text-ink">
      {status.phase === 'error' ? (
        <>
          <div className="text-lg font-semibold text-loss">Connect failed</div>
          <div className="max-w-sm text-sm text-ink-soft">{status.message}</div>
        </>
      ) : status.phase === 'success' ? (
        <>
          <div className="gain-text text-lg font-semibold">Account connected</div>
          <div className="max-w-sm text-sm text-ink-soft">
            Your Angel One session has been saved. Switching the dashboard to live mode is wired up
            in the next step — for now this just confirms the session was stored correctly.
          </div>
        </>
      ) : (
        <div className="text-sm text-ink-faint">{status.phase === 'storing' ? 'Saving your session…' : 'Connecting…'}</div>
      )}
      <a href="/" className="text-sm text-primary-start hover:underline">
        Back to dashboard
      </a>
    </div>
  )
}

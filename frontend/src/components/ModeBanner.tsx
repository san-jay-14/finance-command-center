import { useState } from 'react'
import { AuthControl } from './AuthControl'
import { LinkIcon } from '../dashboard/icons'
import { useAuth } from '../hooks/useAuth'
import { useBrokerSession } from '../hooks/useBrokerSession'
import { startConnect } from '../lib/angelOneConnect'
import { disconnectBrokerSession } from '../lib/brokerConnect'
import { useModeStore } from '../store/modeStore'

// Persistent strip pinned above the dashboard, floating windows, and orb
// (z-50, higher than WindowsLayer's z-40) — never a dismissible toast, so
// the active mode is always visible per the brief's "no silent mode
// switches" requirement. Both CTAs are real as of Step 8: connect (demo
// mode, gated on sign-in — Step 6 needs a signed-in user to scope the
// stored broker session to) and disconnect (live mode, deletes the stored
// session). Mode itself is driven by useModeSync elsewhere (App.tsx) — this
// component just reflects it plus the client code / expiry state.
//
// Overlaid directly on the purple NetWorthCard hero (not a separate strip
// pushing the dashboard down) — fixed positioning takes it out of document
// flow entirely, so Dashboard's root needs no compensating padding. A
// tinted, blurred glass bar rather than a solid one so it reads as part of
// the hero rather than a hard-edged bar dropped on top of it.
//
// Three-column grid (not a single centered flex row) so the low-key
// sign-in control can sit at the far right without pulling the mode
// message off-center — both edge columns use minmax(0,1fr) so the auth
// control's variable width (email form vs "Sign in" vs signed-in email)
// never fights the center group for space.
export function ModeBanner() {
  const mode = useModeStore((s) => s.mode)
  const expired = useModeStore((s) => s.expired)
  const setMode = useModeStore((s) => s.setMode)
  const isDemo = mode === 'demo'
  const { user } = useAuth()
  const { clientCode } = useBrokerSession()
  const [hint, setHint] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)

  function showHint(message: string) {
    setHint(message)
    setTimeout(() => setHint(null), 4000)
  }

  function handleConnectClick() {
    if (!user) {
      showHint('Sign in first (top right) →')
      return
    }
    const result = startConnect()
    if (!result.ok) {
      showHint(result.error)
    }
  }

  async function handleDisconnectClick() {
    setDisconnecting(true)
    const result = await disconnectBrokerSession()
    setDisconnecting(false)
    if (!result.ok) {
      showHint(result.error)
      return
    }
    // Instant feedback rather than waiting for useModeSync's next check —
    // that check will independently confirm the same thing once it re-runs.
    setMode('demo')
  }

  return (
    <div className="fixed inset-x-0 top-0 z-50 grid h-11 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-white/10 bg-black/30 px-4 text-sm backdrop-blur-md">
      <div />
      <div className="flex items-center justify-center gap-3">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${isDemo ? 'bg-gradient-to-br from-primary-start to-primary-end' : 'bg-gain'}`}
          aria-hidden
        />
        <span className="truncate">
          <span className="font-semibold text-ink">
            {isDemo ? 'Demo Mode' : `Connected to Angel One${clientCode ? ` (${clientCode})` : ''}`}
          </span>
          <span className="text-ink-soft">
            {' — '}
            {isDemo
              ? expired
                ? 'your broker session expired, showing demo data. Reconnect to resume live data.'
                : 'showing sample data. Connect your Angel One account to see your real portfolio.'
              : 'showing your live portfolio data.'}
          </span>
        </span>
        {isDemo ? (
          <button
            type="button"
            onClick={handleConnectClick}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-br from-primary-start to-primary-end px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            <LinkIcon className="h-3.5 w-3.5" />
            {expired ? 'Reconnect your account' : 'Connect your account'}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleDisconnectClick}
            disabled={disconnecting}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-br from-primary-start to-primary-end px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LinkIcon className="h-3.5 w-3.5" />
            {disconnecting ? 'Disconnecting…' : 'Disconnect'}
          </button>
        )}
        {hint && <span className="shrink-0 text-xs font-medium text-ink">{hint}</span>}
      </div>
      <div className="justify-self-end overflow-hidden">
        <AuthControl />
      </div>
    </div>
  )
}

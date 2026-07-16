import { LinkIcon } from '../dashboard/icons'
import { useModeStore } from '../store/modeStore'

// Persistent strip pinned above the dashboard, floating windows, and orb
// (z-50, higher than WindowsLayer's z-40) — never a dismissible toast, so
// the active mode is always visible per the brief's "no silent mode
// switches" requirement. The connect/disconnect CTA is a disabled
// placeholder until Step 5 builds the real flow.
//
// Fixed height (h-11) — Dashboard's root pt-11 reserves matching space so
// this doesn't cover the dashboard content underneath. Keep both in sync.
export function ModeBanner() {
  const mode = useModeStore((s) => s.mode)
  const isDemo = mode === 'demo'

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex h-11 items-center justify-center gap-3 border-b border-border-soft bg-card px-4 text-sm">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${isDemo ? 'bg-gradient-to-br from-primary-start to-primary-end' : 'bg-gain'}`}
        aria-hidden
      />
      <span className="truncate">
        <span className="font-semibold text-ink">{isDemo ? 'Demo Mode' : 'Connected to Angel One'}</span>
        <span className="text-ink-soft">
          {' — '}
          {isDemo
            ? 'showing sample data. Connect your Angel One account to see your real portfolio.'
            : 'showing your live portfolio data.'}
        </span>
      </span>
      <button
        type="button"
        disabled
        title="Coming soon"
        className="flex shrink-0 cursor-not-allowed items-center gap-1.5 rounded-full bg-gradient-to-br from-primary-start to-primary-end px-3 py-1 text-xs font-semibold text-white opacity-50"
      >
        <LinkIcon className="h-3.5 w-3.5" />
        {isDemo ? 'Connect your account' : 'Disconnect'}
      </button>
    </div>
  )
}

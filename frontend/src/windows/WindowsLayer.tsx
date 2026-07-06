import { AnimatePresence } from 'framer-motion'
import type { LivePrices } from '../hooks/useLivePrices'
import { useWindowsStore } from '../store/windowsStore'
import { Window } from './Window'

// Fixed full-viewport layer above the dashboard, below the orb (z-40 vs the
// orb's much higher z-index). pointer-events-none on the layer itself so gaps
// between windows don't block the dashboard underneath; each Rnd re-enables
// pointer-events for its own footprint.
export function WindowsLayer({ livePrices }: { livePrices: LivePrices }) {
  const windows = useWindowsStore((s) => s.windows)

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      <AnimatePresence>
        {windows.map((entry) => (
          <Window key={entry.id} entry={entry} livePrices={livePrices} />
        ))}
      </AnimatePresence>
    </div>
  )
}

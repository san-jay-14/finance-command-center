import type { DashboardActivity } from '../lib/api'
import { money, timeAgo } from './format'
import { capRows, useMaxRows } from './useMaxRows'

const ROW_HEIGHT = 48
// Space at the foot of this column kept visually clear of text — the voice
// orb lands here next session. Rows cap earlier instead of the orb needing a
// heavy backdrop to stay legible over text.
const ORB_RESERVED_PX = 84

const ACTION_VERBS: Record<string, string> = {
  buy: 'Bought',
  sell: 'Sold',
  manual_entry: 'Added',
}

function describe(entry: DashboardActivity): string {
  const verb = ACTION_VERBS[entry.action] ?? entry.action
  const name = entry.asset_name ?? entry.symbol ?? 'asset'
  let qty = ''
  if (entry.quantity !== null && entry.asset_class === 'gold') {
    qty = `${entry.quantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })}g `
  } else if (entry.quantity !== null && (entry.asset_class === 'stock' || entry.asset_class === 'mutual_fund')) {
    qty = `${entry.quantity.toLocaleString('en-IN', { maximumFractionDigits: 0 })} `
  }
  return `${verb} ${qty}${name}`
}

export function ActivityColumn({ activity }: { activity: DashboardActivity[] }) {
  const { ref, maxRows } = useMaxRows(ROW_HEIGHT, ORB_RESERVED_PX)
  const { visible, hiddenCount } = capRows(activity, maxRows)

  return (
    <section className="glass-panel flex min-h-0 flex-col overflow-hidden p-4">
      <h2 className="mb-2 shrink-0 text-[11px] font-medium uppercase tracking-[0.22em] text-parchment/50">Activity</h2>
      <div ref={ref} className="min-h-0 flex-1 overflow-hidden">
        {visible.map((entry) => (
          <div key={entry.id} className="flex h-12 items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm text-parchment">
                {describe(entry)} <span className="font-numeric text-parchment/70">· {money(entry.amount)}</span>
              </div>
              {entry.source === 'system' && <div className="text-[11px] text-parchment/40">auto · recurring</div>}
            </div>
            <div className="shrink-0 font-numeric text-[11px] text-parchment/35">{timeAgo(entry.created_at)}</div>
          </div>
        ))}
        {hiddenCount > 0 && (
          <div className="flex h-12 items-center text-xs text-parchment/35">+{hiddenCount} more</div>
        )}
      </div>
    </section>
  )
}

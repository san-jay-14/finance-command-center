import type { DashboardUpcoming } from '../lib/api'
import { money, shortDate } from './format'
import { capRows, useMaxRows } from './useMaxRows'

const ROW_HEIGHT = 48

const FREQUENCY_LABELS: Record<string, string> = {
  daily: '/day',
  weekly: '/wk',
  monthly: '/mo',
}

const CLASS_LABELS: Record<string, string> = {
  stock: 'Stock',
  mutual_fund: 'Mutual fund',
  gold: 'Gold',
  real_estate: 'Real estate',
  other: 'Other',
}

// Unified chronological schedule. Today this is recurring-rule run dates
// (each rule's next few occurrences); broker orders and GTT rules merge into
// the same list once those exist.
export function UpcomingColumn({ upcoming }: { upcoming: DashboardUpcoming[] }) {
  const { ref, maxRows } = useMaxRows(ROW_HEIGHT)
  const { visible, hiddenCount } = capRows(upcoming, maxRows)

  return (
    <section className="glass-panel flex min-h-0 flex-col overflow-hidden p-4">
      <h2 className="mb-2 shrink-0 text-[11px] font-medium uppercase tracking-[0.22em] text-parchment/50">Upcoming</h2>
      <div ref={ref} className="min-h-0 flex-1 overflow-hidden">
        {visible.map((entry, i) => (
          <div key={`${entry.rule_id}-${entry.date}-${i}`} className="flex h-12 items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm text-parchment">
                {CLASS_LABELS[entry.asset_class] ?? entry.asset_class} SIP{' '}
                <span className="font-numeric text-parchment/70">
                  · {money(entry.amount)}
                  <span className="text-parchment/40">{FREQUENCY_LABELS[entry.frequency] ?? ''}</span>
                </span>
              </div>
              <div className="text-[11px] text-parchment/40">recurring contribution</div>
            </div>
            <div className="shrink-0 font-numeric text-[11px] text-parchment/60">{shortDate(entry.date)}</div>
          </div>
        ))}
        {visible.length === 0 && maxRows > 0 && (
          <div className="flex h-12 items-center text-xs text-parchment/35">Nothing scheduled</div>
        )}
        {hiddenCount > 0 && (
          <div className="flex h-12 items-center text-xs text-parchment/35">+{hiddenCount} more</div>
        )}
      </div>
    </section>
  )
}

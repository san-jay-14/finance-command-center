import type { DashboardUpcoming } from '../lib/api'
import { money, shortDate } from './format'

const VISIBLE_ROWS = 6

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
export function UpcomingCard({ upcoming }: { upcoming: DashboardUpcoming[] }) {
  const visible = upcoming.slice(0, VISIBLE_ROWS)
  const hiddenCount = upcoming.length - visible.length

  return (
    <section className="card flex min-h-0 flex-col p-5">
      <h2 className="mb-3 shrink-0 text-[11px] font-semibold tracking-[0.18em] text-ink-soft uppercase">Upcoming</h2>
      {visible.length === 0 ? (
        <div className="flex h-12 items-center text-sm text-ink-faint">Nothing scheduled</div>
      ) : (
        <div className="flex flex-col divide-y divide-border-soft">
          {visible.map((entry, i) => (
            <div
              key={`${entry.rule_id}-${entry.date}-${i}`}
              className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-ink">
                  {CLASS_LABELS[entry.asset_class] ?? entry.asset_class} SIP{' '}
                  <span className="font-numeric text-ink-soft">
                    · {money(entry.amount)}
                    <span className="text-ink-faint">{FREQUENCY_LABELS[entry.frequency] ?? ''}</span>
                  </span>
                </div>
                <div className="text-[11px] text-ink-faint">recurring contribution</div>
              </div>
              <div className="font-numeric shrink-0 text-[11px] text-ink-soft">{shortDate(entry.date)}</div>
            </div>
          ))}
          {hiddenCount > 0 && <div className="pt-2.5 text-xs text-ink-faint">+{hiddenCount} more</div>}
        </div>
      )}
    </section>
  )
}

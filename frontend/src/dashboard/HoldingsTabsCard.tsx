import { useState } from 'react'
import type { NetWorthHolding } from '../lib/api'
import { money, quantityLabel } from './format'
import { LiveNumber } from './LiveNumber'

type TabKey = 'stock' | 'mutual_fund' | 'other'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'stock', label: 'Stocks' },
  { key: 'other', label: 'Other' },
  { key: 'mutual_fund', label: 'MF' },
]

const EMPTY_LABELS: Record<TabKey, string> = {
  stock: 'No stock holdings yet.',
  mutual_fund: 'No mutual fund holdings yet.',
  other: 'No other assets yet.',
}

// One tall card holding all three asset groups behind tabs (Stocks / Other /
// Mutual Funds) instead of three side-by-side cards — sits to the right of
// the Upcoming/Income/Monthly Commitments stack, spanning their full height.
export function HoldingsTabsCard({ holdings }: { holdings: NetWorthHolding[] }) {
  const [tab, setTab] = useState<TabKey>('stock')

  const filtered = holdings.filter((h) =>
    tab === 'other' ? h.asset_class === 'gold' || h.asset_class === 'real_estate' || h.asset_class === 'other' : h.asset_class === tab,
  )
  const sorted = [...filtered].sort((a, b) => (b.current_value ?? 0) - (a.current_value ?? 0))

  return (
    <section className="card flex h-full min-h-0 flex-col p-5">
      <div className="mb-3 flex shrink-0 gap-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase transition-colors ${
              tab === t.key ? 'bg-gradient-to-br from-primary-start to-primary-end text-white' : 'text-ink-soft hover:bg-page'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sorted.length === 0 ? (
        <div className="flex h-12 items-center text-sm text-ink-faint">{EMPTY_LABELS[tab]}</div>
      ) : (
        <div className="no-scrollbar flex min-h-0 flex-1 flex-col divide-y divide-border-soft overflow-y-auto">
          {sorted.map((h) => {
            const dayPct = h.day_change_pct
            const dayUp = (dayPct ?? 0) >= 0
            const isGold = h.asset_class === 'gold'
            return (
              <div key={h.asset_id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="flex min-w-0 items-center gap-2.5">
                  {isGold && <span className="gold-dot h-2 w-2 shrink-0 rounded-full" aria-hidden />}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink">{h.symbol ?? h.name}</div>
                    <div className="truncate text-[11px] text-ink-faint">{quantityLabel(h.asset_class, h.quantity)}</div>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-numeric text-sm text-ink">
                    <LiveNumber value={h.current_value !== null ? money(h.current_value) : '—'} />
                  </div>
                  {dayPct !== null && (
                    <div className={`font-numeric text-[11px] ${dayUp ? 'gain-text' : 'loss-text'}`}>
                      <LiveNumber value={`${dayUp ? '▲' : '▼'} ${Math.abs(dayPct).toFixed(2)}%`} />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

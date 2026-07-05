import type { NetWorthHolding } from '../lib/api'
import { money, quantityLabel } from './format'
import { LiveNumber } from './LiveNumber'
import { capRows, useMaxRows } from './useMaxRows'

const ROW_HEIGHT = 48

// One unified list: stocks, MF, gold, real estate, and manual assets
// together (not separated), sorted by value.
export function HoldingsColumn({ holdings }: { holdings: NetWorthHolding[] }) {
  const { ref, maxRows } = useMaxRows(ROW_HEIGHT)
  const sorted = [...holdings].sort((a, b) => (b.current_value ?? 0) - (a.current_value ?? 0))
  const { visible, hiddenCount } = capRows(sorted, maxRows)

  return (
    <section className="glass-panel flex min-h-0 flex-col overflow-hidden p-4">
      <h2 className="mb-2 shrink-0 text-[11px] font-medium uppercase tracking-[0.22em] text-parchment/50">Holdings</h2>
      <div ref={ref} className="min-h-0 flex-1 overflow-hidden">
        {visible.map((h) => {
          const dayPct = h.day_change_pct
          const dayUp = (dayPct ?? 0) >= 0
          return (
            <div key={h.asset_id} className="flex h-12 items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm text-parchment">{h.symbol ?? h.name}</div>
                <div className="truncate text-[11px] text-parchment/40">{quantityLabel(h.asset_class, h.quantity)}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-numeric text-sm text-parchment">
                  <LiveNumber value={h.current_value !== null ? money(h.current_value) : '—'} />
                </div>
                {dayPct !== null && (
                  <div className={`font-numeric text-[11px] ${dayUp ? 'text-gain' : 'text-loss'}`}>
                    <LiveNumber value={`${dayUp ? '▲' : '▼'} ${Math.abs(dayPct).toFixed(2)}%`} />
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {hiddenCount > 0 && (
          <div className="flex h-12 items-center text-xs text-parchment/35">+{hiddenCount} more</div>
        )}
      </div>
    </section>
  )
}

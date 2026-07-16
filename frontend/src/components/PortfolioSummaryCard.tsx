import { useEffect, useMemo, useState } from 'react'
import { fetchNetWorth, type NetWorthHolding } from '../lib/api'
import type { VizProps } from '../lib/types'
import { useModeStore } from '../store/modeStore'

// The render_ui spec's `data` field has nothing real to offer here — Claude
// has no tool to fetch actual portfolio numbers, so this component fetches
// get-net-worth itself and layers live ticks (via `livePrices`) on top.
export function PortfolioSummaryCard({ livePrices }: VizProps) {
  const mode = useModeStore((s) => s.mode)
  const [holdings, setHoldings] = useState<NetWorthHolding[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchNetWorth(mode)
      .then((res) => setHoldings(res.holdings.filter((h) => h.asset_class === 'stock')))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [mode])

  const enriched = useMemo(() => {
    if (!holdings) return []
    return holdings.map((h) => {
      const live = h.symbol ? livePrices[h.symbol] : undefined
      const currentPrice = live?.ltp ?? h.current_price
      const currentValue = currentPrice != null ? h.quantity * currentPrice : h.current_value
      const unrealizedPnl = currentValue != null ? currentValue - h.invested_value : h.unrealized_pnl
      return { ...h, current_price: currentPrice, current_value: currentValue, unrealized_pnl: unrealizedPnl, isLive: Boolean(live) }
    })
  }, [holdings, livePrices])

  if (error) {
    return <div className="p-6 text-sm text-loss">Couldn't load portfolio: {error}</div>
  }
  if (!holdings) {
    return <div className="p-6 text-sm text-ink-faint">Loading portfolio…</div>
  }

  const totalValue = enriched.reduce((sum, h) => sum + (h.current_value ?? 0), 0)
  const totalInvested = enriched.reduce((sum, h) => sum + h.invested_value, 0)
  const totalPnl = totalValue - totalInvested

  const money = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 })

  return (
    <div className="flex h-full flex-col gap-4 p-6 text-ink">
      <div>
        <div className="text-sm text-ink-soft">Total stock value</div>
        <div className="text-3xl font-semibold text-ink">₹{money(totalValue)}</div>
        <div className={totalPnl >= 0 ? 'text-sm gain-text' : 'text-sm loss-text'}>
          {totalPnl >= 0 ? '+' : ''}₹{money(totalPnl)} unrealized
        </div>
      </div>
      <div className="flex-1 overflow-auto rounded-lg border border-border-soft">
        <table className="w-full text-sm">
          <thead className="bg-page text-left text-ink-soft">
            <tr>
              <th className="px-3 py-2">Symbol</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">Value</th>
              <th className="px-3 py-2 text-right">P&L</th>
            </tr>
          </thead>
          <tbody>
            {enriched.map((h) => (
              <tr key={h.symbol} className="border-t border-border-soft">
                <td className="px-3 py-2 font-medium text-ink">
                  {h.symbol}
                  {h.isLive && (
                    <span className="gain-text ml-2 inline-block h-1.5 w-1.5 rounded-full bg-current align-middle" title="Live price" />
                  )}
                </td>
                <td className="px-3 py-2 text-right">{h.quantity}</td>
                <td className="px-3 py-2 text-right">{h.current_price?.toFixed(2) ?? '—'}</td>
                <td className="px-3 py-2 text-right">{h.current_value != null ? money(h.current_value) : '—'}</td>
                <td className={'px-3 py-2 text-right ' + ((h.unrealized_pnl ?? 0) >= 0 ? 'gain-text' : 'loss-text')}>
                  {h.unrealized_pnl != null ? money(h.unrealized_pnl) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

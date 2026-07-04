import { useEffect, useMemo, useState } from 'react'
import { fetchNetWorth, type NetWorthHolding } from '../lib/api'
import type { VizProps } from '../lib/types'

// The render_ui spec's `data` field has nothing real to offer here — Claude
// has no tool to fetch actual portfolio numbers, so this component fetches
// get-net-worth itself and layers live ticks (via `livePrices`) on top.
export function PortfolioSummaryCard({ livePrices }: VizProps) {
  const [holdings, setHoldings] = useState<NetWorthHolding[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchNetWorth()
      .then((res) => setHoldings(res.holdings.filter((h) => h.asset_class === 'stock')))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [])

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
    return <div className="p-6 text-sm text-red-600">Couldn't load portfolio: {error}</div>
  }
  if (!holdings) {
    return <div className="p-6 text-sm text-neutral-400">Loading portfolio…</div>
  }

  const totalValue = enriched.reduce((sum, h) => sum + (h.current_value ?? 0), 0)
  const totalInvested = enriched.reduce((sum, h) => sum + h.invested_value, 0)
  const totalPnl = totalValue - totalInvested

  const money = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 })

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div>
        <div className="text-sm text-neutral-500">Total stock value</div>
        <div className="text-3xl font-semibold text-neutral-900">₹{money(totalValue)}</div>
        <div className={totalPnl >= 0 ? 'text-sm text-emerald-600' : 'text-sm text-red-600'}>
          {totalPnl >= 0 ? '+' : ''}₹{money(totalPnl)} unrealized
        </div>
      </div>
      <div className="flex-1 overflow-auto rounded-lg border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
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
              <tr key={h.symbol} className="border-t border-neutral-100">
                <td className="px-3 py-2 font-medium text-neutral-900">
                  {h.symbol}
                  {h.isLive && (
                    <span
                      className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle"
                      title="Live price"
                    />
                  )}
                </td>
                <td className="px-3 py-2 text-right">{h.quantity}</td>
                <td className="px-3 py-2 text-right">{h.current_price?.toFixed(2) ?? '—'}</td>
                <td className="px-3 py-2 text-right">{h.current_value != null ? money(h.current_value) : '—'}</td>
                <td
                  className={
                    'px-3 py-2 text-right ' +
                    ((h.unrealized_pnl ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600')
                  }
                >
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

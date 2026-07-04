import { useEffect, useMemo, useState } from 'react'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { fetchNetWorth, type NetWorthHolding } from '../lib/api'
import type { VizProps } from '../lib/types'

const COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed', '#0891b2', '#db2777']

// Real data — same get-net-worth source as PortfolioSummaryCard. Only stock
// holdings exist right now; other asset classes (gold, mutual funds, etc.)
// are a later build-order step, so this is a distribution across the
// holdings that exist today, not yet across asset classes.
export function AssetDistributionPie({ livePrices }: VizProps) {
  const [holdings, setHoldings] = useState<NetWorthHolding[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchNetWorth()
      .then((res) => setHoldings(res.holdings))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [])

  const slices = useMemo(() => {
    if (!holdings) return []
    return holdings
      .map((h) => {
        const live = livePrices[h.symbol]
        const price = live?.ltp ?? h.current_price ?? 0
        return { name: h.symbol, value: h.quantity * price }
      })
      .filter((s) => s.value > 0)
  }, [holdings, livePrices])

  if (error) {
    return <div className="p-6 text-sm text-red-600">Couldn't load distribution: {error}</div>
  }
  if (!holdings) {
    return <div className="p-6 text-sm text-neutral-400">Loading distribution…</div>
  }
  if (slices.length === 0) {
    return <div className="p-6 text-sm text-neutral-400">No holdings to show yet.</div>
  }

  return (
    <div className="flex h-full flex-col gap-2 p-6">
      <div className="text-sm text-neutral-500">Stock holdings by value (other asset classes come later)</div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="name" outerRadius="80%" label>
              {slices.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

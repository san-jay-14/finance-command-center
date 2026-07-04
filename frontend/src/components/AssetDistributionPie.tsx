import { useEffect, useMemo, useState } from 'react'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { fetchNetWorth } from '../lib/api'
import type { VizProps } from '../lib/types'

const COLORS: Record<string, string> = {
  stock: '#2563eb',
  mutual_fund: '#059669',
  gold: '#d97706',
  real_estate: '#7c3aed',
  other: '#6b7280',
}

const LABELS: Record<string, string> = {
  stock: 'Stocks',
  mutual_fund: 'Mutual Funds',
  gold: 'Gold',
  real_estate: 'Real Estate',
  other: 'Other',
}

// Real data across ALL asset classes now (build-order step 6) — each class
// valued by its own strategy in supabase/functions/_shared/valuation.ts.
export function AssetDistributionPie(_props: VizProps) {
  const [byAssetClass, setByAssetClass] = useState<Record<string, number> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchNetWorth()
      .then((res) => setByAssetClass(res.by_asset_class))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [])

  const slices = useMemo(() => {
    if (!byAssetClass) return []
    return Object.entries(byAssetClass)
      .filter(([, value]) => value > 0)
      .map(([assetClass, value]) => ({ name: LABELS[assetClass] ?? assetClass, assetClass, value }))
  }, [byAssetClass])

  if (error) {
    return <div className="p-6 text-sm text-red-600">Couldn't load distribution: {error}</div>
  }
  if (!byAssetClass) {
    return <div className="p-6 text-sm text-neutral-400">Loading distribution…</div>
  }
  if (slices.length === 0) {
    return <div className="p-6 text-sm text-neutral-400">No holdings to show yet.</div>
  }

  return (
    <div className="flex h-full flex-col gap-2 p-6">
      <div className="text-sm text-neutral-500">Net worth by asset class</div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="name" outerRadius="80%" label>
              {slices.map((slice) => (
                <Cell key={slice.assetClass} fill={COLORS[slice.assetClass] ?? '#9ca3af'} />
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

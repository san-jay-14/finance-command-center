import { useEffect, useMemo, useState } from 'react'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { fetchNetWorth } from '../lib/api'
import type { VizProps } from '../lib/types'
import { useModeStore } from '../store/modeStore'

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
  const mode = useModeStore((s) => s.mode)
  const [byAssetClass, setByAssetClass] = useState<Record<string, number> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchNetWorth(mode)
      .then((res) => setByAssetClass(res.by_asset_class))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [mode])

  const slices = useMemo(() => {
    if (!byAssetClass) return []
    return Object.entries(byAssetClass)
      .filter(([, value]) => value > 0)
      .map(([assetClass, value]) => ({ name: LABELS[assetClass] ?? assetClass, assetClass, value }))
  }, [byAssetClass])

  if (error) {
    return <div className="p-6 text-sm text-loss">Couldn't load distribution: {error}</div>
  }
  if (!byAssetClass) {
    return <div className="p-6 text-sm text-ink-faint">Loading distribution…</div>
  }
  if (slices.length === 0) {
    return <div className="p-6 text-sm text-ink-faint">No holdings to show yet.</div>
  }

  return (
    <div className="flex h-full flex-col gap-2 p-6 text-ink">
      <div className="text-sm text-ink-soft">Net worth by asset class</div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="name" outerRadius="80%" label={{ fill: '#f1eff7' }}>
              {slices.map((slice) => (
                <Cell key={slice.assetClass} fill={COLORS[slice.assetClass] ?? '#9ca3af'} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ background: '#1c1a26', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#f1eff7' }} />
            <Legend wrapperStyle={{ color: '#a9a6bc' }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

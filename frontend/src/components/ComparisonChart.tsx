import { useMemo } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { VizProps } from '../lib/types'

const COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706']

// Synthetic series — there's no historical price API wired up yet (that's a
// later valuation-engine build step). This proves the chart renders from a
// render_ui spec, not real backtested prices.
function mockSeries(seed: number, points: number): number[] {
  let value = 100 + seed * 37
  const series: number[] = []
  for (let i = 0; i < points; i++) {
    value += (Math.sin(i / 3 + seed) + (Math.random() - 0.5)) * 4
    series.push(Math.round(value * 100) / 100)
  }
  return series
}

export function ComparisonChart({ data, livePrices }: VizProps) {
  const symbols = (Array.isArray(data.symbols) ? data.symbols : []) as string[]
  const range = typeof data.range === 'string' ? data.range : '6M'

  const chartData = useMemo(() => {
    if (symbols.length === 0) return []
    const points = 24
    const perSymbol = symbols.map((_, i) => mockSeries(i + 1, points))
    return Array.from({ length: points }, (_, i) => {
      const row: Record<string, number> = { index: i }
      symbols.forEach((symbol, si) => {
        row[symbol] = perSymbol[si][i]
      })
      return row
    })
  }, [symbols])

  if (symbols.length === 0) {
    return <div className="p-6 text-sm text-ink-faint">No symbols to compare.</div>
  }

  return (
    <div className="flex h-full flex-col gap-3 p-6 text-ink">
      <div className="text-sm text-ink-soft">
        Comparing {symbols.join(' vs ')} · {range} (simulated — no historical price feed wired up yet)
      </div>
      <div className="flex gap-4 text-sm">
        {symbols.map((s, i) => (
          <div key={s} className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
            {s}
            {livePrices[s] ? ` · live ${livePrices[s].ltp}` : ''}
          </div>
        ))}
      </div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="index" tick={false} />
            <YAxis tick={{ fill: '#a9a6bc' }} />
            <Tooltip contentStyle={{ background: '#1c1a26', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#f1eff7' }} />
            <Legend wrapperStyle={{ color: '#a9a6bc' }} />
            {symbols.map((s, i) => (
              <Line key={s} type="monotone" dataKey={s} stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={2} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

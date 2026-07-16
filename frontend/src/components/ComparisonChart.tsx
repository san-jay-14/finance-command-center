import { useEffect, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fetchPriceHistory } from '../lib/api'
import type { VizProps } from '../lib/types'
import { useModeStore } from '../store/modeStore'

const COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706']

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// The LLM passes range as a loose string ('1M', '6M', '1Y', 'YTD', ...) since
// it's not schema-constrained — parse what we can, default to 6 months.
function rangeToDates(range: string): { fromDate: string; toDate: string } {
  const to = new Date()
  const from = new Date(to)
  if (/^ytd$/i.test(range)) {
    from.setMonth(0, 1)
  } else {
    const match = /^(\d+)\s*([dmy])/i.exec(range.trim())
    const n = match ? Number(match[1]) : 6
    const unit = match ? match[2].toLowerCase() : 'm'
    if (unit === 'd') from.setDate(from.getDate() - n)
    else if (unit === 'y') from.setFullYear(from.getFullYear() - n)
    else from.setMonth(from.getMonth() - n)
  }
  return { fromDate: isoDate(from), toDate: isoDate(to) }
}

type ChartRow = { date: string; [symbol: string]: string | number }

export function ComparisonChart({ data, livePrices }: VizProps) {
  const mode = useModeStore((s) => s.mode)
  const symbols = (Array.isArray(data.symbols) ? data.symbols : []) as string[]
  const range = typeof data.range === 'string' ? data.range : '6M'

  const [chartData, setChartData] = useState<ChartRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (symbols.length === 0) return
    let cancelled = false
    setChartData(null)
    setError(null)

    const { fromDate, toDate } = rangeToDates(range)

    // Sequential, not Promise.all — Angel One's historical-data endpoint
    // rate-limits concurrent hits (rejects with "exceeding access rate"
    // when multiple symbols are requested at once). One at a time, each
    // request's own round trip already spaces them out enough.
    async function load() {
      const byDate = new Map<string, ChartRow>()
      for (const symbol of symbols) {
        const result = await fetchPriceHistory(mode, symbol, fromDate, toDate)
        if (cancelled) return
        for (const candle of result.candles) {
          const row = byDate.get(candle.candle_date) ?? { date: candle.candle_date }
          row[symbol] = candle.close
          byDate.set(candle.candle_date, row)
        }
      }
      const rows = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
      setChartData(rows)
    }

    load().catch((err) => {
      if (!cancelled) setError((err as Error).message)
    })

    return () => {
      cancelled = true
    }
  }, [symbols.join(','), range, mode])

  if (symbols.length === 0) {
    return <div className="p-6 text-sm text-ink-faint">No symbols to compare.</div>
  }

  return (
    <div className="flex h-full flex-col gap-3 p-6 text-ink">
      <div className="text-sm text-ink-soft">
        Comparing {symbols.join(' vs ')} · {range}
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
        {error ? (
          <div className="loss-text flex h-full items-center text-sm">Couldn't load history: {error}</div>
        ) : chartData === null ? (
          <div className="flex h-full items-center text-sm text-ink-faint">Loading history…</div>
        ) : chartData.length === 0 ? (
          <div className="flex h-full items-center text-sm text-ink-faint">No historical data for this range.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="date" tick={{ fill: '#a9a6bc', fontSize: 11 }} />
              <YAxis tick={{ fill: '#a9a6bc' }} />
              <Tooltip contentStyle={{ background: '#1c1a26', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#f1eff7' }} />
              <Legend wrapperStyle={{ color: '#a9a6bc' }} />
              {symbols.map((s, i) => (
                <Line key={s} type="monotone" dataKey={s} stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={2} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { VizProps } from '../lib/types'

type SeriesPoint = { date: string; invested_cumulative: number; value: number }

type BacktestData = {
  symbol: string
  strategy_type: 'lump_sum' | 'monthly_sip'
  from_date: string
  to_date: string
  total_invested: number
  current_value: number
  absolute_return: number
  percent_return: number
  series: SeriesPoint[]
}

const money = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

// Data comes straight from the run-backtest Edge Function via handle-message's
// run_backtest tool result — real historical closes, not simulated.
export function BacktestResultCard({ data }: VizProps) {
  const result = data as unknown as BacktestData
  if (!result?.series) {
    return <div className="p-6 text-sm text-ink-faint">No backtest result to show.</div>
  }

  const { symbol, strategy_type, from_date, to_date, total_invested, current_value, absolute_return, percent_return, series } =
    result
  const isGain = absolute_return >= 0

  return (
    <div className="flex h-full flex-col gap-4 p-6 text-ink">
      <div className="text-sm text-ink-soft">
        {strategy_type === 'monthly_sip' ? 'Monthly SIP' : 'Lump sum'} backtest — {symbol} · {from_date} to {to_date}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <div className="text-xs text-ink-faint">Total invested</div>
          <div className="text-lg font-semibold text-ink">{money(total_invested)}</div>
        </div>
        <div>
          <div className="text-xs text-ink-faint">Current value</div>
          <div className="text-lg font-semibold text-ink">{money(current_value)}</div>
        </div>
        <div>
          <div className="text-xs text-ink-faint">Return</div>
          <div className={`text-lg font-semibold ${isGain ? 'gain-text' : 'loss-text'}`}>
            {isGain ? '+' : ''}
            {money(absolute_return)}
          </div>
        </div>
        <div>
          <div className="text-xs text-ink-faint">Return %</div>
          <div className={`text-lg font-semibold ${isGain ? 'gain-text' : 'loss-text'}`}>
            {isGain ? '+' : ''}
            {percent_return.toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#a9a6bc' }} minTickGap={40} />
            <YAxis tick={{ fontSize: 11, fill: '#a9a6bc' }} />
            <Tooltip
              formatter={(value) => (typeof value === 'number' ? money(value) : value)}
              contentStyle={{ background: '#1c1a26', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#f1eff7' }}
            />
            <Legend wrapperStyle={{ color: '#a9a6bc' }} />
            <Area
              type="monotone"
              dataKey="invested_cumulative"
              name="Invested"
              stroke="#a9a6bc"
              fill="#a9a6bc"
              fillOpacity={0.15}
              dot={false}
            />
            <Area
              type="monotone"
              dataKey="value"
              name="Value"
              stroke="#9b7cff"
              fill="#9b7cff"
              fillOpacity={0.2}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

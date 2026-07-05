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
    return <div className="p-6 text-sm text-neutral-400">No backtest result to show.</div>
  }

  const { symbol, strategy_type, from_date, to_date, total_invested, current_value, absolute_return, percent_return, series } =
    result
  const isGain = absolute_return >= 0

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="text-sm text-neutral-500">
        {strategy_type === 'monthly_sip' ? 'Monthly SIP' : 'Lump sum'} backtest — {symbol} · {from_date} to {to_date}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <div className="text-xs text-neutral-500">Total invested</div>
          <div className="text-lg font-semibold text-neutral-900">{money(total_invested)}</div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">Current value</div>
          <div className="text-lg font-semibold text-neutral-900">{money(current_value)}</div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">Return</div>
          <div className={`text-lg font-semibold ${isGain ? 'text-emerald-600' : 'text-red-600'}`}>
            {isGain ? '+' : ''}
            {money(absolute_return)}
          </div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">Return %</div>
          <div className={`text-lg font-semibold ${isGain ? 'text-emerald-600' : 'text-red-600'}`}>
            {isGain ? '+' : ''}
            {percent_return.toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={40} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value) => (typeof value === 'number' ? money(value) : value)} />
            <Legend />
            <Area
              type="monotone"
              dataKey="invested_cumulative"
              name="Invested"
              stroke="#94a3b8"
              fill="#94a3b8"
              fillOpacity={0.15}
              dot={false}
            />
            <Area
              type="monotone"
              dataKey="value"
              name="Value"
              stroke="#2563eb"
              fill="#2563eb"
              fillOpacity={0.15}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

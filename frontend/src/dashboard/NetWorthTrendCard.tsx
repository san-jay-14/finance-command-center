import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { NetWorthHistoryPoint } from '../lib/api'
import { money } from './format'
import { TrendUpIcon } from './icons'

// Replaces the old Income card — one real snapshot per day accumulates here
// (get-net-worth upserts today's total on every call), so this genuinely
// tracks how net worth has moved rather than showing fabricated history.
// With only a day or two of data so far, the chart will look sparse until
// more days accumulate — that's expected, not a bug.
export function NetWorthTrendCard({ history }: { history: NetWorthHistoryPoint[] }) {
  const first = history[0]?.total_value
  const last = history[history.length - 1]?.total_value
  const changePct = first && last && first > 0 ? ((last - first) / first) * 100 : null

  return (
    <section className="card flex h-full min-h-0 flex-col p-5">
      <div className="mb-2 flex shrink-0 items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.18em] text-ink-soft uppercase">
          <TrendUpIcon className="h-3.5 w-3.5" />
          Net Worth Trend
        </h2>
        {changePct !== null && (
          <span className={`font-numeric text-[11px] ${changePct >= 0 ? 'gain-text' : 'loss-text'}`}>
            {changePct >= 0 ? '▲' : '▼'} {Math.abs(changePct).toFixed(2)}%
          </span>
        )}
      </div>
      {history.length < 2 ? (
        <div className="flex flex-1 items-center text-sm text-ink-faint">
          {history.length === 0 ? 'Tracking starts today — check back tomorrow.' : 'Only one day tracked so far — more points appear daily.'}
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="netWorthTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#9b7cff" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#9b7cff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={false} axisLine={false} tickLine={false} />
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip
                formatter={(value) => [money(Number(value)), 'Net worth']}
                labelFormatter={(label) => new Date(String(label)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                contentStyle={{ background: '#1c1a26', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#f1eff7', fontSize: 12 }}
              />
              <Area type="monotone" dataKey="total_value" stroke="#9b7cff" strokeWidth={2} fill="url(#netWorthTrendFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}

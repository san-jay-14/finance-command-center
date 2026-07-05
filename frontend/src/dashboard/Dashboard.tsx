import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useLivePrices } from '../hooks/useLivePrices'
import { fetchDashboard, fetchNetWorth } from '../lib/api'
import { ActivityColumn } from './ActivityColumn'
import { AuroraBackground } from './AuroraBackground'
import { money } from './format'
import { HoldingsColumn } from './HoldingsColumn'
import { LiveNumber } from './LiveNumber'
import { UpcomingColumn } from './UpcomingColumn'

const USER_ID = import.meta.env.VITE_USER_ID
// Live prices tick every second or so via the Realtime channel; re-polling
// the snapshot itself just needs to catch changes made elsewhere (a new
// transaction, a new recurring rule) — 30s keeps the two forms of "live"
// from fighting over what's authoritative.
const REFETCH_MS = 30_000

// Fixed 100vh instrument panel (no scrolling anywhere, hard constraint):
// header strip ~12vh, income/EMI strip ~6vh, three equal columns fill the
// rest. Columns self-truncate via row capping instead of ever overflowing.
export function Dashboard() {
  const { data: netWorth } = useQuery({
    queryKey: ['net-worth'],
    queryFn: fetchNetWorth,
    refetchInterval: REFETCH_MS,
  })
  const { data: dash } = useQuery({
    queryKey: ['dashboard', USER_ID],
    queryFn: () => fetchDashboard(USER_ID),
    refetchInterval: REFETCH_MS,
  })
  const livePrices = useLivePrices()

  // Overlay live ticks onto the fetched snapshot: stock rows re-value from
  // the latest LTP, and day change re-derives against the same previous
  // close the snapshot was computed from.
  const live = useMemo(() => {
    if (!netWorth) return null
    let totalValue = 0
    let dayChangeValue = 0
    let hasDayChange = false

    const holdings = netWorth.holdings.map((h) => {
      const tick = h.symbol && h.asset_class === 'stock' ? livePrices[h.symbol] : undefined
      if (!tick || h.current_price === null) return h
      const prevClose =
        h.day_change_pct !== null ? h.current_price / (1 + h.day_change_pct / 100) : null
      const value = h.quantity * tick.ltp
      return {
        ...h,
        current_price: tick.ltp,
        current_value: value,
        day_change_value: prevClose !== null ? (tick.ltp - prevClose) * h.quantity : h.day_change_value,
        day_change_pct: prevClose !== null && prevClose > 0 ? ((tick.ltp - prevClose) / prevClose) * 100 : h.day_change_pct,
      }
    })

    for (const h of holdings) {
      totalValue += h.current_value ?? 0
      if (h.day_change_value !== null) {
        dayChangeValue += h.day_change_value
        hasDayChange = true
      }
    }
    const prevTotal = totalValue - dayChangeValue
    return {
      holdings,
      totalValue,
      dayChangeValue: hasDayChange ? dayChangeValue : null,
      dayChangePct: hasDayChange && prevTotal > 0 ? (dayChangeValue / prevTotal) * 100 : null,
    }
  }, [netWorth, livePrices])

  const dayUp = (live?.dayChangeValue ?? 0) >= 0
  const profile = dash?.profile
  const foirPct = profile?.foir_ratio !== null && profile?.foir_ratio !== undefined ? profile.foir_ratio * 100 : null

  return (
    <div className="relative flex h-screen flex-col gap-3 overflow-hidden p-4 font-body text-parchment">
      <AuroraBackground />

      {/* -------------------------------------------------- header strip -- */}
      <header className="glass-panel flex shrink-0 items-center justify-between px-7" style={{ flexBasis: '12vh' }}>
        <div>
          <div className="font-display text-2xl tracking-tight text-parchment">{profile?.name ?? '—'}</div>
          {profile?.age != null && <div className="text-xs text-parchment/45">{profile.age} yrs</div>}
        </div>
        <div className="relative text-right">
          <div className="live-glow" />
          <div className="relative font-display text-4xl font-medium tracking-tight">
            <LiveNumber className="gold-text" value={live ? money(live.totalValue) : '—'} />
          </div>
          <div className={`relative mt-0.5 font-numeric text-sm ${dayUp ? 'text-gain' : 'text-loss'}`}>
            {live?.dayChangeValue !== null && live?.dayChangeValue !== undefined ? (
              <LiveNumber
                value={`${dayUp ? '▲' : '▼'} ${money(Math.abs(live.dayChangeValue))} (${Math.abs(live.dayChangePct ?? 0).toFixed(2)}%) today`}
              />
            ) : (
              <span className="text-parchment/40">day change unavailable</span>
            )}
          </div>
        </div>
      </header>

      {/* ---------------------------------------------- income/EMI strip -- */}
      <div className="glass-panel flex shrink-0 items-center gap-10 px-7" style={{ flexBasis: '6vh', minHeight: '3.25rem' }}>
        <div className="flex items-baseline gap-2.5">
          <span className="text-[11px] uppercase tracking-[0.18em] text-parchment/45">Income</span>
          <span className="font-numeric text-sm text-parchment">
            {profile?.monthly_income !== null && profile?.monthly_income !== undefined ? money(profile.monthly_income) : '—'}
            <span className="text-parchment/40">/mo</span>
          </span>
        </div>
        <div className="flex items-baseline gap-2.5">
          <span className="text-[11px] uppercase tracking-[0.18em] text-parchment/45">EMI</span>
          <span className="font-numeric text-sm text-parchment">
            {profile ? money(profile.existing_emis) : '—'}
            {foirPct !== null && <span className="text-parchment/40"> ({foirPct.toFixed(0)}% of income)</span>}
          </span>
        </div>
      </div>

      {/* -------------------------------------------------- three columns -- */}
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-3">
        <HoldingsColumn holdings={live?.holdings ?? []} />
        <ActivityColumn activity={dash?.activity ?? []} />
        <UpcomingColumn upcoming={dash?.upcoming ?? []} />
      </div>
    </div>
  )
}

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { LivePrices } from '../hooks/useLivePrices'
import { fetchDashboard, fetchNetWorth } from '../lib/api'
import { HoldingsTabsCard } from './HoldingsTabsCard'
import { MonthlyCommitmentsCard } from './MonthlyCommitmentsCard'
import { NetWorthCard } from './NetWorthCard'
import { NetWorthTrendCard } from './NetWorthTrendCard'
import { UpcomingCard } from './UpcomingCard'

const USER_ID = import.meta.env.VITE_USER_ID
// Live prices tick every second or so via the Realtime channel; re-polling
// the snapshot itself just needs to catch changes made elsewhere (a new
// transaction, a new recurring rule) — 30s keeps the two forms of "live"
// from fighting over what's authoritative.
const REFETCH_MS = 30_000

type DashboardProps = {
  livePrices: LivePrices
}

// Light-theme redesign: a normal scrolling page (not the old fixed 100vh
// panel) — a purple net-worth hero + orb dial pinned at the top, price
// history, and three distinct holdings groups (stocks / mutual funds /
// other) below. livePrices is lifted to App.tsx so the dashboard and the
// floating windows share one Realtime subscription instead of each opening
// its own.
export function Dashboard({ livePrices }: DashboardProps) {
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

  const holdings = live?.holdings ?? []
  const profile = dash?.profile

  return (
    <div className="min-h-screen bg-page font-body text-ink">
      <div className="sticky top-0 z-30">
        <NetWorthCard
          totalValue={live?.totalValue ?? null}
          dayChangeValue={live?.dayChangeValue ?? null}
          dayChangePct={live?.dayChangePct ?? null}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 px-6 pt-3 pb-8 lg:grid-cols-[3fr_2fr]">
        <div className="flex min-h-0 flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <UpcomingCard upcoming={dash?.upcoming ?? []} />
            <NetWorthTrendCard history={netWorth?.history ?? []} />
          </div>
          <MonthlyCommitmentsCard
            existingEmis={profile?.existing_emis ?? null}
            recurringCommitments={profile?.foir_recurring_commitments ?? null}
            foirRatio={profile?.foir_ratio ?? null}
            foirLimit={profile?.foir_limit ?? null}
          />
        </div>

        <HoldingsTabsCard holdings={holdings} />
      </div>
    </div>
  )
}

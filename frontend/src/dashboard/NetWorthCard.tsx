import { money } from './format'
import { LiveNumber } from './LiveNumber'
import { NetWorthSplit } from './NetWorthSplit'
import { OrbCard } from './OrbCard'

type NetWorthCardProps = {
  totalValue: number | null
  dayChangeValue: number | null
  dayChangePct: number | null
  stockValue: number | null
  personalValue: number | null
  investmentValue: number | null
}

// Full-bleed purple-gradient hero banner spanning the entire top of the
// layout (no side/top gaps) — the voice orb's home slot sits inside it, on
// the right. The split diagram sits right off the net-worth figure itself
// (one cluster, tight gap) rather than floating in the middle of the banner.
export function NetWorthCard({
  totalValue,
  dayChangeValue,
  dayChangePct,
  stockValue,
  personalValue,
  investmentValue,
}: NetWorthCardProps) {
  const dayUp = (dayChangeValue ?? 0) >= 0
  return (
    <div className="card-purple relative flex h-72 w-full items-center justify-between overflow-hidden px-10">
      <div className="live-glow" />
      <div className="flex items-center gap-10">
        <div className="relative">
          <div className="text-xs font-medium tracking-[0.14em] text-white/70 uppercase">Net Worth</div>
          <div className="mt-1 font-display text-5xl font-semibold tracking-tight text-white">
            <LiveNumber value={totalValue !== null ? money(totalValue) : '—'} />
          </div>
          <div className={`font-numeric mt-2 text-sm font-medium ${dayUp ? 'gain-text' : 'loss-text'}`}>
            {dayChangeValue !== null && dayChangePct !== null ? (
              <LiveNumber
                value={`${dayUp ? '▲' : '▼'} ${money(Math.abs(dayChangeValue))} (${Math.abs(dayChangePct).toFixed(2)}%) today`}
              />
            ) : (
              <span className="text-white/60">day change unavailable</span>
            )}
          </div>
        </div>

        <NetWorthSplit stock={stockValue} personal={personalValue} investment={investmentValue} />
      </div>

      <div className="relative shrink-0">
        <OrbCard />
      </div>
    </div>
  )
}

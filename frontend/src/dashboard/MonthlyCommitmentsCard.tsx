import { money } from './format'
import { GaugeIcon } from './icons'

type MonthlyCommitmentsCardProps = {
  existingEmis: number | null
  recurringCommitments: number | null
  foirRatio: number | null
  foirLimit: number | null
}

// Standing FOIR breakdown — EMIs + recurring contributions against the
// 40%-style limit, revived here as its own card per the new layout (was
// folded into the top strip before the light-theme redesign dropped it).
export function MonthlyCommitmentsCard({ existingEmis, recurringCommitments, foirRatio, foirLimit }: MonthlyCommitmentsCardProps) {
  const foirPct = foirRatio !== null ? foirRatio * 100 : null
  const limitPct = foirLimit !== null ? foirLimit * 100 : 40
  const isOver = foirPct !== null && foirPct > limitPct

  return (
    <section className="card flex min-h-0 flex-1 flex-col p-5">
      <h2 className="mb-3 flex shrink-0 items-center gap-1.5 text-[11px] font-semibold tracking-[0.18em] text-ink-soft uppercase">
        <GaugeIcon className="h-3.5 w-3.5" />
        Monthly Commitments
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <div className="text-[11px] text-ink-faint">Existing EMIs</div>
          <div className="font-numeric text-lg text-ink">{existingEmis !== null ? money(existingEmis) : '—'}</div>
        </div>
        <div>
          <div className="text-[11px] text-ink-faint">Recurring contributions</div>
          <div className="font-numeric text-lg text-ink">{recurringCommitments !== null ? money(recurringCommitments) : '—'}</div>
        </div>
        <div>
          <div className="text-[11px] text-ink-faint">FOIR</div>
          <div className="font-numeric text-lg text-ink">
            {foirPct !== null ? `${foirPct.toFixed(0)}%` : '—'}
            <span className={`text-sm ${isOver ? 'loss-text' : 'text-ink-faint'}`}> / {limitPct.toFixed(0)}% limit</span>
          </div>
        </div>
      </div>

      <div className="relative mt-4 h-2 w-full shrink-0 overflow-hidden rounded-full bg-white/5">
        <div
          className={`foir-bar h-full rounded-full ${isOver ? 'foir-bar-over' : ''}`}
          style={{ width: `${Math.min(100, foirPct ?? 0)}%` }}
        />
        <div className="absolute top-0 h-full w-px bg-white/25" style={{ left: `${Math.min(100, limitPct)}%` }} />
      </div>
    </section>
  )
}

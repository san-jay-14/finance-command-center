import { money } from './format'

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

  return (
    <section className="card flex min-h-0 flex-col p-5">
      <h2 className="mb-3 shrink-0 text-[11px] font-semibold tracking-[0.18em] text-ink-soft uppercase">Monthly Commitments</h2>
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
            <span className="text-sm text-ink-faint"> / {limitPct.toFixed(0)}% limit</span>
          </div>
        </div>
      </div>
    </section>
  )
}

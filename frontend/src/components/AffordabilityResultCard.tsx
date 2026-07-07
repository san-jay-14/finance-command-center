import type { VizProps } from '../lib/types'

type CheckStatus = 'pass' | 'fail' | 'skipped' | 'unavailable'

type EmergencyFundCheck = {
  status: CheckStatus
  liquid_assets_before?: number
  liquid_assets_after?: number
  required_minimum?: number
  emergency_fund_months?: number
  margin?: number
  reason?: string
}

type FoirCheck = {
  status: CheckStatus
  existing_emis?: number
  existing_recurring_commitments?: number
  new_emi?: number
  monthly_income?: number
  foir_ratio?: number
  limit?: number
  reason?: string
}

type OpportunityCost = {
  purchase_amount: number
  assumed_annual_return: number
  years: number
  projected_value_if_invested: number
  note: string
}

type AffordabilityData = {
  purchase_amount: number
  checks: {
    emergency_fund: EmergencyFundCheck
    foir: FoirCheck
    opportunity_cost: OpportunityCost
  }
}

const STATUS_STYLES: Record<CheckStatus, string> = {
  pass: 'bg-[#34d399]/15 text-[#34d399]',
  fail: 'bg-[#f87171]/15 text-[#f87171]',
  skipped: 'bg-white/5 text-ink-faint',
  unavailable: 'bg-white/5 text-ink-faint',
}

const STATUS_LABELS: Record<CheckStatus, string> = {
  pass: 'Pass',
  fail: 'Fail',
  skipped: 'Skipped',
  unavailable: 'Unavailable',
}

function Badge({ status }: { status: CheckStatus }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>{STATUS_LABELS[status]}</span>
}

const money = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

// Data comes from the check-affordability Edge Function (PROJECT_BRIEF.md
// section 5's three checks), forwarded as-is via handle-message's
// check_affordability tool result.
export function AffordabilityResultCard({ data }: VizProps) {
  const result = data as unknown as AffordabilityData
  if (!result?.checks) {
    return <div className="p-6 text-sm text-ink-faint">No affordability result to show.</div>
  }
  const { emergency_fund, foir, opportunity_cost } = result.checks

  return (
    <div className="flex h-full flex-col gap-4 p-6 text-ink">
      <div className="text-sm text-ink-soft">Affordability check for {money(result.purchase_amount)}</div>

      <div className="rounded-lg border border-border-soft p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-medium text-ink">Emergency fund</span>
          <Badge status={emergency_fund.status} />
        </div>
        {emergency_fund.status === 'unavailable' ? (
          <p className="text-sm text-ink-soft">{emergency_fund.reason}</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-ink-soft">
            <div>Liquid assets after: {money(emergency_fund.liquid_assets_after ?? 0)}</div>
            <div>
              Required minimum: {money(emergency_fund.required_minimum ?? 0)} ({emergency_fund.emergency_fund_months} mo. expenses)
            </div>
            <div className={(emergency_fund.margin ?? 0) >= 0 ? 'gain-text' : 'loss-text'}>
              Margin: {(emergency_fund.margin ?? 0) >= 0 ? '+' : ''}
              {money(emergency_fund.margin ?? 0)}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border-soft p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-medium text-ink">FOIR / 40% rule</span>
          <Badge status={foir.status} />
        </div>
        {foir.status === 'skipped' || foir.status === 'unavailable' ? (
          <p className="text-sm text-ink-soft">{foir.reason}</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-ink-soft">
            <div>
              FOIR: {((foir.foir_ratio ?? 0) * 100).toFixed(1)}% (limit {((foir.limit ?? 0.4) * 100).toFixed(0)}%)
            </div>
            <div>New EMI: {money(foir.new_emi ?? 0)}</div>
            <div>Existing EMIs: {money(foir.existing_emis ?? 0)}</div>
            <div>Recurring commitments: {money(foir.existing_recurring_commitments ?? 0)}</div>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-primary-start/30 bg-primary-start/10 p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-medium text-ink">Opportunity cost</span>
          <span className="rounded-full bg-primary-start/20 px-2 py-0.5 text-xs font-medium text-primary-end">Info</span>
        </div>
        <p className="text-sm text-ink-soft">
          If left invested at an assumed ~{(opportunity_cost.assumed_annual_return * 100).toFixed(0)}%/year, this amount could grow to{' '}
          <span className="font-medium text-ink">{money(opportunity_cost.projected_value_if_invested)}</span> in{' '}
          {opportunity_cost.years} years.
        </p>
      </div>
    </div>
  )
}

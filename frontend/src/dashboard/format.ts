export const money = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

const ACTION_VERBS: Record<string, string> = {
  buy: 'Bought',
  sell: 'Sold',
  manual_entry: 'Added',
}

export type TransactionSummary = {
  action: string
  quantity: number | null
  amount: number
  asset_name: string | null
  asset_class: string | null
}

// Shared by the activity-history window and the live transaction toasts —
// one description format for "what just happened" everywhere it's shown.
export function describeTransaction(entry: TransactionSummary): string {
  const verb = ACTION_VERBS[entry.action] ?? entry.action
  const name = entry.asset_name ?? 'asset'
  let qty = ''
  if (entry.quantity !== null && entry.asset_class === 'gold') {
    qty = `${entry.quantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })}g `
  } else if (entry.quantity !== null && (entry.asset_class === 'stock' || entry.asset_class === 'mutual_fund')) {
    qty = `${entry.quantity.toLocaleString('en-IN', { maximumFractionDigits: 0 })} `
  }
  return `${verb} ${qty}${name} · ${money(entry.amount)}`
}

export function quantityLabel(assetClass: string, quantity: number): string {
  switch (assetClass) {
    case 'stock':
      return `${quantity.toLocaleString('en-IN', { maximumFractionDigits: 0 })} sh`
    case 'mutual_fund':
      return `${quantity.toLocaleString('en-IN', { maximumFractionDigits: 1 })} units`
    case 'gold':
      return `${quantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })} g`
    case 'real_estate':
      return 'property'
    default:
      return 'manual entry'
  }
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 60) return `${Math.max(mins, 0)}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

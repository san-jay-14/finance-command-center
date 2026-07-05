export const money = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

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

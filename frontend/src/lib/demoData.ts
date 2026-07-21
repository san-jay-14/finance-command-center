import type {
  DashboardActivity,
  DashboardResponse,
  DashboardUpcoming,
  NetWorthHistoryPoint,
  NetWorthHolding,
  NetWorthResponse,
  PriceHistoryCandle,
  PriceHistoryResponse,
  ProactiveInsightsResponse,
} from './api'

// Everything in this file is fictional, static, and computed client-side —
// no network call ever happens on the demo path (Step 2 verify requirement:
// mode 'demo' must produce zero real API calls).

// Deterministic PRNG (mulberry32) seeded from a string hash, so the same
// symbol/series always produces the same shape instead of reshuffling on
// every reload — stable-looking demo data, not visibly random.
function hashSeed(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

function monthsFromNow(n: number): Date {
  const d = new Date()
  d.setMonth(d.getMonth() + n, 5) // land on the 5th, matching the app's SIP-date convention
  return d
}

// ---------------------------------------------------------------- Holdings

type DemoHoldingSeed = {
  asset_id: string
  symbol: string | null
  name: string
  asset_class: NetWorthHolding['asset_class']
  quantity: number
  buy_price: number
  current_price: number
  prev_close: number | null // only stocks carry a broker-reported previous close
}

// Recognizable large-cap tickers, round-ish but non-suspicious numbers —
// nothing resembling a real personal portfolio.
const DEMO_HOLDING_SEEDS: DemoHoldingSeed[] = [
  { asset_id: 'demo-reliance', symbol: 'RELIANCE-EQ', name: 'Reliance Industries', asset_class: 'stock', quantity: 100, buy_price: 2400, current_price: 2550, prev_close: 2515 },
  { asset_id: 'demo-tcs', symbol: 'TCS-EQ', name: 'Tata Consultancy Services', asset_class: 'stock', quantity: 60, buy_price: 3600, current_price: 3550, prev_close: 3580 },
  { asset_id: 'demo-hdfcbank', symbol: 'HDFCBANK-EQ', name: 'HDFC Bank', asset_class: 'stock', quantity: 150, buy_price: 1550, current_price: 1620, prev_close: 1595 },
  { asset_id: 'demo-infy', symbol: 'INFY-EQ', name: 'Infosys', asset_class: 'stock', quantity: 120, buy_price: 1450, current_price: 1500, prev_close: 1512 },
  { asset_id: 'demo-mf', symbol: 'AXISBLUECHIP', name: 'Axis Bluechip Fund', asset_class: 'mutual_fund', quantity: 500, buy_price: 45, current_price: 52, prev_close: null },
  { asset_id: 'demo-gold', symbol: null, name: 'Digital Gold', asset_class: 'gold', quantity: 50, buy_price: 5500, current_price: 6100, prev_close: null },
  { asset_id: 'demo-realestate', symbol: null, name: '2BHK Apartment, Whitefield', asset_class: 'real_estate', quantity: 1, buy_price: 3200000, current_price: 3450000, prev_close: null },
  { asset_id: 'demo-car', symbol: null, name: 'Maruti Swift (2022)', asset_class: 'other', quantity: 1, buy_price: 500000, current_price: 380000, prev_close: null },
]

// Mirrors the "if sold today" adjustment factors in
// supabase/functions/_shared/valuation.ts so demo numbers read the same way
// live ones do, without importing server-only code into the frontend bundle.
const IF_SOLD_FACTOR: Record<string, number> = {
  stock: 0.999,
  mutual_fund: 1,
  gold: 0.97,
  real_estate: 0.93,
  other: 1,
}

const ADJUSTMENT_NOTE: Record<string, string> = {
  stock: 'Approximate STT only (~0.1%); brokerage assumed zero. Demo data — not a real position.',
  mutual_fund: 'Exit load and capital gains tax not modeled. Demo data — not a real position.',
  gold: '~3% resale spread/making-charge estimate. Demo data — not a real position.',
  real_estate: '~7% approximate stamp duty + brokerage deduction. Demo data — not a real position.',
  other: 'User-entered estimate, as-is. Demo data — not a real position.',
}

function buildDemoHoldings(): NetWorthHolding[] {
  const nowIso = new Date().toISOString()
  return DEMO_HOLDING_SEEDS.map((seed) => {
    const currentValue = seed.quantity * seed.current_price
    const investedValue = seed.quantity * seed.buy_price
    const dayChangeValue = seed.prev_close !== null ? (seed.current_price - seed.prev_close) * seed.quantity : null
    const dayChangePct =
      seed.prev_close !== null && seed.prev_close > 0
        ? ((seed.current_price - seed.prev_close) / seed.prev_close) * 100
        : null
    return {
      asset_id: seed.asset_id,
      symbol: seed.symbol,
      name: seed.name,
      asset_class: seed.asset_class,
      quantity: seed.quantity,
      current_price: seed.current_price,
      current_value: currentValue,
      invested_value: investedValue,
      unrealized_pnl: currentValue - investedValue,
      if_sold_today_value: currentValue * IF_SOLD_FACTOR[seed.asset_class],
      adjustment_note: ADJUSTMENT_NOTE[seed.asset_class],
      price_as_of: nowIso,
      day_change_value: dayChangeValue,
      day_change_pct: dayChangePct,
    }
  })
}

// ----------------------------------------------------------- Net worth trend

const HISTORY_DAYS = 30

function buildDemoHistory(finalTotal: number): NetWorthHistoryPoint[] {
  const rand = mulberry32(hashSeed('demo-net-worth-trend'))
  const startTotal = finalTotal * 0.94
  const today = new Date()
  const points: NetWorthHistoryPoint[] = []
  for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const progress = (HISTORY_DAYS - 1 - i) / (HISTORY_DAYS - 1)
    const trend = startTotal + (finalTotal - startTotal) * progress
    const noise = (rand() - 0.5) * finalTotal * 0.01
    const value = i === 0 ? finalTotal : trend + noise
    points.push({ date: isoDate(d), total_value: Math.round(value) })
  }
  return points
}

export function getDemoNetWorth(): NetWorthResponse {
  const holdings = buildDemoHoldings()
  let totalValue = 0
  let dayChangeValue = 0
  let hasDayChange = false
  const byAssetClass: Record<string, number> = {}
  for (const h of holdings) {
    totalValue += h.current_value ?? 0
    byAssetClass[h.asset_class] = (byAssetClass[h.asset_class] ?? 0) + (h.current_value ?? 0)
    if (h.day_change_value !== null) {
      dayChangeValue += h.day_change_value
      hasDayChange = true
    }
  }
  const prevTotal = totalValue - dayChangeValue
  return {
    total_value: totalValue,
    day_change_value: hasDayChange ? dayChangeValue : null,
    day_change_pct: hasDayChange && prevTotal > 0 ? (dayChangeValue / prevTotal) * 100 : null,
    by_asset_class: byAssetClass,
    holdings,
    history: buildDemoHistory(totalValue),
  }
}

// ------------------------------------------------------- Dashboard (profile)

const DEMO_ACTIVITY: DashboardActivity[] = [
  { id: 'demo-act-1', action: 'buy', quantity: 100, amount: 240000, source: 'voice', created_at: daysAgo(36), asset_name: 'Reliance Industries', asset_class: 'stock', symbol: 'RELIANCE-EQ' },
  { id: 'demo-act-2', action: 'buy', quantity: 60, amount: 216000, source: 'manual', created_at: daysAgo(62), asset_name: 'Tata Consultancy Services', asset_class: 'stock', symbol: 'TCS-EQ' },
  { id: 'demo-act-3', action: 'buy', quantity: 150, amount: 232500, source: 'voice', created_at: daysAgo(88), asset_name: 'HDFC Bank', asset_class: 'stock', symbol: 'HDFCBANK-EQ' },
  { id: 'demo-act-4', action: 'buy', quantity: 120, amount: 174000, source: 'system', created_at: daysAgo(120), asset_name: 'Infosys', asset_class: 'stock', symbol: 'INFY-EQ' },
  { id: 'demo-act-5', action: 'manual_entry', quantity: 50, amount: 275000, source: 'manual', created_at: daysAgo(150), asset_name: 'Digital Gold', asset_class: 'gold', symbol: null },
  { id: 'demo-act-6', action: 'manual_entry', quantity: 1, amount: 3200000, source: 'manual', created_at: daysAgo(400), asset_name: '2BHK Apartment, Whitefield', asset_class: 'real_estate', symbol: null },
]

const DEMO_UPCOMING: DashboardUpcoming[] = [
  // EMI lines mirror what get-dashboard now synthesizes from existing_emis
  // (15000/mo here) so demo and live show the same shape of schedule.
  { type: 'emi', rule_id: 'demo-emi-0', asset_class: 'emi', amount: 15000, frequency: 'monthly', date: isoDate(monthsFromNow(1)) },
  { type: 'emi', rule_id: 'demo-emi-1', asset_class: 'emi', amount: 15000, frequency: 'monthly', date: isoDate(monthsFromNow(2)) },
  { type: 'recurring', rule_id: 'demo-rule-gold', asset_class: 'gold', amount: 5000, frequency: 'monthly', date: isoDate(monthsFromNow(1)) },
  { type: 'recurring', rule_id: 'demo-rule-mf', asset_class: 'mutual_fund', amount: 10000, frequency: 'monthly', date: isoDate(monthsFromNow(1)) },
  { type: 'recurring', rule_id: 'demo-rule-gold', asset_class: 'gold', amount: 5000, frequency: 'monthly', date: isoDate(monthsFromNow(2)) },
  { type: 'recurring', rule_id: 'demo-rule-mf', asset_class: 'mutual_fund', amount: 10000, frequency: 'monthly', date: isoDate(monthsFromNow(2)) },
]

export function getDemoDashboard(): DashboardResponse {
  const monthlyIncome = 150000
  const existingEmis = 15000
  const recurringCommitments = 15000 // sum of DEMO_UPCOMING's distinct monthly rule amounts (5000 gold + 10000 MF)
  return {
    profile: {
      name: 'Demo User',
      age: 32,
      monthly_income: monthlyIncome,
      monthly_expenses: 60000,
      existing_emis: existingEmis,
      foir_ratio: (existingEmis + recurringCommitments) / monthlyIncome,
      foir_recurring_commitments: recurringCommitments,
      foir_limit: 0.4, // fraction, matches supabase/functions/_shared/foir.ts FOIR_LIMIT
    },
    activity: [...DEMO_ACTIVITY].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    upcoming: [...DEMO_UPCOMING].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12),
  }
}

// ------------------------------------------------------- Price history (candles)

function isWeekend(d: Date): boolean {
  const day = d.getDay()
  return day === 0 || day === 6
}

// Generic synthetic OHLC generator — works for any requested symbol/range
// (not just the demo holdings above), seeded by the symbol so results are
// stable across repeated calls instead of reshuffling on every render.
export function getDemoPriceHistory(symbol: string, fromDate: string, toDate: string): PriceHistoryResponse {
  const seed = hashSeed(symbol)
  const rand = mulberry32(seed)
  let close = 200 + (seed % 3800) // spread across a plausible ₹200–₹4000 base price

  const candles: PriceHistoryCandle[] = []
  const from = new Date(fromDate)
  const to = new Date(toDate)
  for (const d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    if (isWeekend(d)) continue
    const open = close
    const drift = (rand() - 0.48) * 0.02 // small daily moves, slight upward bias
    close = Math.max(1, open * (1 + drift))
    const high = Math.max(open, close) * (1 + rand() * 0.006)
    const low = Math.min(open, close) * (1 - rand() * 0.006)
    candles.push({
      candle_date: isoDate(d),
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
    })
  }

  return { symbol, candles }
}

// ------------------------------------------------------------ Proactive insights

export function getDemoProactiveInsights(): ProactiveInsightsResponse {
  return {
    insights: [
      "Your gold holdings are up ~11% since purchase — worth checking if it's grown past your target allocation.",
      'Your FOIR is at 20%, well under the 40% limit — there is room for another recurring investment.',
      'HDFC Bank is your best mover today, up 1.57%.',
    ],
  }
}

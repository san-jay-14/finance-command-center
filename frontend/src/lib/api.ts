const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

async function callFunction<T>(name: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`${name} failed (${res.status}): ${detail}`)
  }
  return res.json()
}

export type NetWorthHolding = {
  asset_id: string
  symbol: string | null
  name: string
  asset_class: 'stock' | 'mutual_fund' | 'gold' | 'real_estate' | 'other'
  quantity: number
  current_price: number | null
  current_value: number | null
  invested_value: number
  unrealized_pnl: number | null
  if_sold_today_value: number | null
  adjustment_note: string
  price_as_of: string | null
  day_change_value: number | null
  day_change_pct: number | null
}

export type NetWorthHistoryPoint = { date: string; total_value: number }

export type NetWorthResponse = {
  total_value: number
  day_change_value: number | null
  day_change_pct: number | null
  by_asset_class: Record<string, number>
  holdings: NetWorthHolding[]
  history: NetWorthHistoryPoint[]
}

export function fetchNetWorth(): Promise<NetWorthResponse> {
  return callFunction<NetWorthResponse>('get-net-worth')
}

export type PriceHistoryCandle = {
  candle_date: string
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export type PriceHistoryResponse = { symbol: string; candles: PriceHistoryCandle[] }

// get-price-history is a plain GET (query params, not a JSON body) so it
// doesn't go through callFunction — used by the comparison chart to pull
// real closes per symbol instead of a synthetic series.
export async function fetchPriceHistory(symbol: string, fromDate: string, toDate: string): Promise<PriceHistoryResponse> {
  const params = new URLSearchParams({ symbol, from_date: fromDate, to_date: toDate })
  const res = await fetch(`${SUPABASE_URL}/functions/v1/get-price-history?${params}`, {
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`get-price-history failed (${res.status}): ${detail}`)
  }
  return res.json()
}

export type HandleMessageResponse =
  | { tool: 'render_ui'; component: string; data: Record<string, unknown> }
  | { tool: 'log_transaction'; message: string; transaction: unknown }
  | { tool: 'update_asset_value'; message: string }
  | { tool: 'create_recurring_rule'; message: string; rule: unknown }
  | { tool: 'update_financial_profile'; message: string; profile: unknown }
  | { tool: 'check_affordability'; message: string; result: Record<string, unknown> }
  | { tool: 'run_backtest'; message: string; result: Record<string, unknown> }
  | { tool: 'show_price_chart'; message: string; result: Record<string, unknown> }
  | { tool: 'close_window'; message: string; titles: string[] }
  | { tool: 'close_all_windows'; message: string }
  | { tool: 'show_activity_history'; message: string; activity: Record<string, unknown>[] }
  | { tool: 'ask_clarification'; message: string; pending_intent: unknown }
  | { tool: null; message: string }

// openWindowTitles gives Claude the real, current list of open window titles
// so "close the asset distribution" / "close all" can resolve against what's
// actually on screen right now (window state is frontend-only/session-only,
// the backend has no other way to know it).
export function sendMessage(
  message: string,
  userId: string,
  openWindowTitles: string[] = [],
): Promise<HandleMessageResponse> {
  return callFunction<HandleMessageResponse>('handle-message', {
    message,
    user_id: userId,
    open_window_titles: openWindowTitles,
  })
}

export type DashboardActivity = {
  id: string
  action: 'buy' | 'sell' | 'manual_entry'
  quantity: number | null
  amount: number
  source: 'voice' | 'manual' | 'system'
  created_at: string
  asset_name: string | null
  asset_class: string | null
  symbol: string | null
}

export type DashboardUpcoming = {
  type: 'recurring'
  rule_id: string
  asset_class: string
  amount: number
  frequency: 'daily' | 'weekly' | 'monthly'
  date: string
}

export type DashboardResponse = {
  profile: {
    name: string | null
    age: number | null
    monthly_income: number | null
    monthly_expenses: number | null
    existing_emis: number
    foir_ratio: number | null
    foir_recurring_commitments: number
    foir_limit: number
  }
  activity: DashboardActivity[]
  upcoming: DashboardUpcoming[]
}

export function fetchDashboard(userId: string): Promise<DashboardResponse> {
  return callFunction<DashboardResponse>('get-dashboard', { user_id: userId })
}

export type ProactiveInsightsResponse = { insights: string[] }

export function fetchProactiveInsights(userId: string): Promise<ProactiveInsightsResponse> {
  return callFunction<ProactiveInsightsResponse>('get-proactive-insights', { user_id: userId })
}

export async function fetchSpeechAudio(text: string): Promise<Blob> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/text-to-speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`text-to-speech failed (${res.status}): ${detail}`)
  }
  return res.blob()
}

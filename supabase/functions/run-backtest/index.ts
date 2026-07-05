// Historical data + backtesting (not in the original build order). Fetches
// real historical closes via the relay's /historical read-through cache
// (relay owns all SmartAPI-specific logic per PROJECT_BRIEF.md section 3),
// then simulates exactly two strategies — no free-form strategy parsing.
import { corsHeaders, json } from "../_shared/cors.ts";

type CandleRow = { candle_date: string; close: number };
type SeriesPoint = { date: string; invested_cumulative: number; value: number };

function computeLumpSum(candles: CandleRow[], amount: number) {
  const first = candles[0];
  const last = candles[candles.length - 1];
  const shares = amount / first.close;
  const series: SeriesPoint[] = candles.map((c) => ({
    date: c.candle_date,
    invested_cumulative: amount,
    value: shares * c.close,
  }));
  return { totalInvested: amount, currentValue: shares * last.close, series };
}

function computeMonthlySip(candles: CandleRow[], amount: number) {
  let totalShares = 0;
  let totalInvested = 0;
  let lastSeenMonth: string | null = null;
  const series: SeriesPoint[] = [];
  for (const c of candles) {
    const month = c.candle_date.slice(0, 7); // YYYY-MM
    if (month !== lastSeenMonth) {
      // First trading day seen in a new calendar month within range — buy.
      totalShares += amount / c.close;
      totalInvested += amount;
      lastSeenMonth = month;
    }
    series.push({ date: c.candle_date, invested_cumulative: totalInvested, value: totalShares * c.close });
  }
  const last = candles[candles.length - 1];
  return { totalInvested, currentValue: totalShares * last.close, series };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Use POST" }, 405);
  }

  let body: { symbol?: string; strategy_type?: string; amount?: number; from_date?: string; to_date?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { symbol, strategy_type, amount, from_date, to_date } = body;
  if (!symbol || !strategy_type || amount == null || !from_date || !to_date) {
    return json({ error: "symbol, strategy_type, amount, from_date, and to_date are required" }, 400);
  }
  if (strategy_type !== "lump_sum" && strategy_type !== "monthly_sip") {
    return json(
      { error: `Unsupported strategy_type '${strategy_type}' — only 'lump_sum' or 'monthly_sip' are supported` },
      400,
    );
  }

  const relayBaseUrl = Deno.env.get("RELAY_BASE_URL");
  if (!relayBaseUrl) {
    return json({ error: "RELAY_BASE_URL is not configured as a project secret" }, 500);
  }
  const relaySecret = Deno.env.get("RELAY_SHARED_SECRET");

  const params = new URLSearchParams({ symbol, interval: "ONE_DAY", from_date, to_date });
  const relayRes = await fetch(`${relayBaseUrl}/historical?${params}`, {
    headers: relaySecret ? { Authorization: `Bearer ${relaySecret}` } : {},
  });
  const relayBody = await relayRes.json();
  if (!relayRes.ok) {
    return json({ error: relayBody.detail ?? relayBody.error ?? "relay /historical call failed" }, 502);
  }

  const candles = (relayBody.candles ?? []) as CandleRow[];
  if (candles.length === 0) {
    return json({ error: `No historical data found for ${symbol} between ${from_date} and ${to_date}` }, 404);
  }

  const result = strategy_type === "lump_sum" ? computeLumpSum(candles, amount) : computeMonthlySip(candles, amount);
  const absoluteReturn = result.currentValue - result.totalInvested;
  const percentReturn = result.totalInvested > 0 ? (absoluteReturn / result.totalInvested) * 100 : 0;

  return json({
    symbol,
    strategy_type,
    from_date,
    to_date,
    total_invested: result.totalInvested,
    current_value: result.currentValue,
    absolute_return: absoluteReturn,
    percent_return: percentReturn,
    series: result.series,
  });
});

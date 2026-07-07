// Plain data endpoint the frontend calls directly for the dashboard's balance
// chart card (Part B.4 of the light-theme redesign) — same relay /historical
// read-through cache handle-message's show_price_chart tool already uses,
// just exposed as a GET the browser can call without going through Claude.
import { corsHeaders, json } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol");
  const fromDate = url.searchParams.get("from_date");
  const toDate = url.searchParams.get("to_date");
  if (!symbol || !fromDate || !toDate) {
    return json({ error: "symbol, from_date, and to_date query params are required" }, 400);
  }

  const relayBaseUrl = Deno.env.get("RELAY_BASE_URL");
  if (!relayBaseUrl) {
    return json({ error: "RELAY_BASE_URL is not configured as a project secret" }, 500);
  }
  const relaySecret = Deno.env.get("RELAY_SHARED_SECRET");

  const params = new URLSearchParams({ symbol, interval: "ONE_DAY", from_date: fromDate, to_date: toDate });
  const historicalRes = await fetch(`${relayBaseUrl}/historical?${params}`, {
    headers: relaySecret ? { Authorization: `Bearer ${relaySecret}` } : {},
  });
  const historicalBody = await historicalRes.json();
  if (!historicalRes.ok) {
    return json({ error: historicalBody.detail ?? historicalBody.error ?? "relay /historical call failed" }, 500);
  }

  return json({ symbol, candles: historicalBody.candles ?? [] });
});

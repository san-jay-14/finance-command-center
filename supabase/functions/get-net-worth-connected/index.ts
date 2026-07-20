// Real per-visitor live holdings — the actual "multi-tenant" data path for
// Step 7. Calls Angel One's REST API directly (getHolding + getProfile)
// using the caller's own decrypted, Vault-stored session, server-side. Does
// NOT touch the relay service (that's only needed for continuous WebSocket
// ticks) or the assets/lots/valuation.ts pipeline (that's entirely scoped
// to one legacy public.users row from before Supabase Auth existed, and
// mixing a visitor's data into it would risk leaking the founder's own
// financial data — see supabase/migrations/20260717000000_broker_sessions.sql).
//
// Non-stock asset classes (gold/mutual_fund/real_estate/other) aren't held
// at the broker at all — they're logged manually via voice (handle-message's
// log_transaction) into this same owner's assets/lots rows, so they're
// merged in below via the same valuateAssets() pipeline get-net-worth.ts
// (the legacy founder path) uses. Without this merge, a connected visitor's
// voice-logged gold/MF/real-estate purchase would toast success (the write
// really happened, owner-scoped) but never appear anywhere in their own
// live view — the app would look like it silently dropped the transaction.
//
// Known, deliberate gap: history is always empty (no per-visitor historical
// net worth snapshots are tracked).
import { createClient } from "npm:@supabase/supabase-js@2";
import { valuateAssets } from "../_shared/holdings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders });
}

function createAdminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

const ANGEL_ONE_BASE_URL = "https://apiconnect.angelone.in";

function angelOneHeaders(authToken: string, apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-ClientLocalIP": "127.0.0.1",
    "X-ClientPublicIP": "127.0.0.1",
    "X-MACAddress": "00:00:00:00:00:00",
    "X-PrivateKey": apiKey,
    "X-UserType": "USER",
    "X-SourceID": "WEB",
    Authorization: `Bearer ${authToken}`,
  };
}

type AngelHolding = {
  tradingsymbol: string;
  isin?: string | null;
  quantity?: number | string | null;
  averageprice?: number | string | null;
  ltp?: number | string | null;
  close?: number | string | null;
  profitandloss?: number | string | null;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Missing Authorization header" }, 401);
  }

  const apiKey = Deno.env.get("ANGEL_ONE_API_KEY");
  if (!apiKey) {
    return json({ error: "ANGEL_ONE_API_KEY is not configured as a project secret" }, 500);
  }

  const supabase = createAdminClient();
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
  if (userError || !userData.user) {
    return json({ error: "Invalid or expired session" }, 401);
  }

  const { data: secretRows, error: secretError } = await supabase.rpc("get_broker_session_secrets", {
    p_user_id: userData.user.id,
  });
  if (secretError) return json({ error: secretError.message }, 500);
  const session = secretRows?.[0];
  if (!session) {
    return json({ error: "not_connected", message: "No broker session found for this user" }, 404);
  }
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    return json({ error: "session_expired", message: "Broker session has expired" }, 401);
  }

  const headers = angelOneHeaders(session.auth_token, apiKey);

  const [holdingRes, profileRes] = await Promise.all([
    fetch(`${ANGEL_ONE_BASE_URL}/rest/secure/angelbroking/portfolio/v1/getHolding`, { headers }),
    fetch(`${ANGEL_ONE_BASE_URL}/rest/secure/angelbroking/user/v1/getProfile`, { headers }),
  ]);

  const holdingBody = await holdingRes.json().catch(() => null);
  if (!holdingRes.ok || !holdingBody?.status) {
    // Angel One rejecting the token outright (401/403) is distinct from our
    // own expires_at estimate having already caught this above — this is
    // the "broker 401" case Step 8 asks for: the token died some other way
    // before midnight IST. Reported as 401 either way so the frontend can
    // treat both the same (fall back to demo, show the expired message).
    const status = holdingRes.status === 401 || holdingRes.status === 403 ? 401 : 502;
    const error = status === 401 ? "broker_unauthorized" : (holdingBody?.message ?? "Angel One getHolding request failed");
    return json({ error }, status);
  }

  const profileBody = await profileRes.json().catch(() => null);
  const clientCode: string | null = profileRes.ok && profileBody?.status ? (profileBody.data?.clientcode ?? null) : null;
  if (clientCode && !session.client_code) {
    await supabase.rpc("update_broker_session_client_code", { p_user_id: userData.user.id, p_client_code: clientCode });
  }

  const rawHoldings: AngelHolding[] = holdingBody.data ?? [];
  let totalValue = 0;
  let dayChangeValue = 0;
  let hasDayChange = false;
  const byAssetClass: Record<string, number> = {};

  const stockHoldings = rawHoldings.map((raw) => {
    const quantity = Number(raw.quantity ?? 0);
    const currentPrice = raw.ltp != null ? Number(raw.ltp) : null;
    const currentValue = currentPrice !== null ? quantity * currentPrice : null;
    const investedValue = quantity * Number(raw.averageprice ?? 0);
    const prevClose = raw.close != null ? Number(raw.close) : null;
    const dayChangeVal =
      currentPrice !== null && prevClose !== null && prevClose > 0 ? (currentPrice - prevClose) * quantity : null;
    const dayChangePct = currentPrice !== null && prevClose !== null && prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : null;

    if (currentValue !== null) {
      totalValue += currentValue;
      byAssetClass.stock = (byAssetClass.stock ?? 0) + currentValue;
    }
    if (dayChangeVal !== null) {
      dayChangeValue += dayChangeVal;
      hasDayChange = true;
    }

    return {
      asset_id: raw.isin || raw.tradingsymbol,
      symbol: raw.tradingsymbol,
      name: raw.tradingsymbol,
      asset_class: "stock" as const,
      quantity,
      current_price: currentPrice,
      current_value: currentValue,
      invested_value: investedValue,
      unrealized_pnl: currentValue !== null ? currentValue - investedValue : (raw.profitandloss != null ? Number(raw.profitandloss) : null),
      if_sold_today_value: currentValue !== null ? currentValue * 0.999 : null,
      adjustment_note: "Approximate STT only (~0.1%); brokerage assumed zero. Live data from your connected Angel One account.",
      price_as_of: new Date().toISOString(),
      day_change_value: dayChangeVal,
      day_change_pct: dayChangePct,
    };
  });

  // Manually-tracked assets (never held at the broker) for this same owner —
  // reuses the exact valuation pipeline get-net-worth.ts (legacy founder
  // path) uses, just owner-scoped instead of the legacy owner_id IS NULL.
  const manualRows = await valuateAssets(supabase, ["mutual_fund", "gold", "real_estate", "other"], userData.user.id);
  const manualHoldings = manualRows.map(({ holding, valuation }) => {
    if (valuation.current_value !== null) {
      totalValue += valuation.current_value;
      byAssetClass[holding.asset_class] = (byAssetClass[holding.asset_class] ?? 0) + valuation.current_value;
    }
    if (valuation.day_change_value != null) {
      dayChangeValue += valuation.day_change_value;
      hasDayChange = true;
    }
    return {
      asset_id: holding.asset_id,
      symbol: holding.symbol,
      name: holding.name,
      asset_class: holding.asset_class,
      quantity: holding.quantity,
      current_price: valuation.current_price,
      current_value: valuation.current_value,
      invested_value: holding.invested_value,
      unrealized_pnl: valuation.current_value !== null ? valuation.current_value - holding.invested_value : null,
      if_sold_today_value: valuation.if_sold_today_value,
      adjustment_note: valuation.adjustment_note,
      price_as_of: valuation.price_as_of,
      day_change_value: valuation.day_change_value ?? null,
      day_change_pct: valuation.day_change_pct ?? null,
    };
  });

  const holdings = [...stockHoldings, ...manualHoldings];
  const prevTotal = totalValue - dayChangeValue;

  return json({
    total_value: totalValue,
    day_change_value: hasDayChange ? dayChangeValue : null,
    day_change_pct: hasDayChange && prevTotal > 0 ? (dayChangeValue / prevTotal) * 100 : null,
    by_asset_class: byAssetClass,
    holdings,
    history: [],
  });
});

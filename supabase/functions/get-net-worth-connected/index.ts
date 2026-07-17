// Real per-visitor live holdings — the actual "multi-tenant" data path for
// Step 7. Calls Angel One's REST API directly (getHolding + getProfile)
// using the caller's own decrypted, Vault-stored session, server-side. Does
// NOT touch the relay service (that's only needed for continuous WebSocket
// ticks) or the assets/lots/valuation.ts pipeline (that's entirely scoped
// to one legacy public.users row from before Supabase Auth existed, and
// mixing a visitor's data into it would risk leaking the founder's own
// financial data — see supabase/migrations/20260717000000_broker_sessions.sql).
//
// Known, deliberate gap: history is always empty (no per-visitor historical
// net worth snapshots are tracked) and by_asset_class only ever contains
// "stock" (Angel One's holdings API only returns equity positions).
import { createClient } from "npm:@supabase/supabase-js@2";

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
    return json({ error: holdingBody?.message ?? "Angel One getHolding request failed" }, 502);
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

  const holdings = rawHoldings.map((raw) => {
    const quantity = Number(raw.quantity ?? 0);
    const currentPrice = raw.ltp != null ? Number(raw.ltp) : null;
    const currentValue = currentPrice !== null ? quantity * currentPrice : null;
    const investedValue = quantity * Number(raw.averageprice ?? 0);
    const prevClose = raw.close != null ? Number(raw.close) : null;
    const dayChangeVal =
      currentPrice !== null && prevClose !== null && prevClose > 0 ? (currentPrice - prevClose) * quantity : null;
    const dayChangePct = currentPrice !== null && prevClose !== null && prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : null;

    if (currentValue !== null) totalValue += currentValue;
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

  const byAssetClass: Record<string, number> = {};
  if (holdings.length > 0) byAssetClass.stock = totalValue;
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

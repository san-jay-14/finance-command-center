// Plain data query, no AI involved. Build-order step 6: valuation across all
// asset classes (stock, mutual_fund, gold, real_estate, other) via the
// per-class strategy pattern in _shared/valuation.ts.
import { corsHeaders, json } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabaseAdmin.ts";
import { valuateAssets } from "../_shared/holdings.ts";
import { today } from "../_shared/dates.ts";

const HISTORY_DAYS = 30;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createAdminClient();
  // null = legacy founder scope (owner_id IS NULL) — this endpoint is the
  // pre-Supabase-Auth single-tenant path and must never see Step 9's new
  // per-visitor owner_id-scoped rows.
  const rows = await valuateAssets(supabase, undefined, null);

  let totalValue = 0;
  let dayChangeValue = 0;
  let hasDayChange = false;
  const byAssetClass: Record<string, number> = {};

  const holdings = rows.map(({ holding, valuation }) => {
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

  // One row per day — repeated calls the same day just update today's total
  // rather than spamming duplicate points, so the trend chart's history
  // accumulates one real data point per day from here on.
  const todayStr = today();
  await supabase.from("net_worth_snapshots").upsert({ snapshot_date: todayStr, total_value: totalValue }, { onConflict: "snapshot_date" });

  const { data: historyRows } = await supabase
    .from("net_worth_snapshots")
    .select("snapshot_date, total_value")
    .order("snapshot_date", { ascending: true })
    .limit(HISTORY_DAYS);
  const history = (historyRows ?? []).map((r) => ({ date: r.snapshot_date, total_value: Number(r.total_value) }));

  // Day change only covers holdings with a broker-reported previous close
  // (stocks) — manual assets don't move intraday. Percentage is against the
  // start-of-day value of those same holdings, not the whole net worth.
  const prevTotal = totalValue - dayChangeValue;
  return json({
    total_value: totalValue,
    day_change_value: hasDayChange ? dayChangeValue : null,
    day_change_pct: hasDayChange && prevTotal > 0 ? (dayChangeValue / prevTotal) * 100 : null,
    by_asset_class: byAssetClass,
    holdings,
    history,
  });
});

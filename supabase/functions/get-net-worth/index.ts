// Plain data query, no AI involved. Build-order step 6: valuation across all
// asset classes (stock, mutual_fund, gold, real_estate, other) via the
// per-class strategy pattern in _shared/valuation.ts.
import { corsHeaders, json } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabaseAdmin.ts";
import { valuateAssets } from "../_shared/holdings.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createAdminClient();
  const rows = await valuateAssets(supabase);

  let totalValue = 0;
  const byAssetClass: Record<string, number> = {};

  const holdings = rows.map(({ holding, valuation }) => {
    if (valuation.current_value !== null) {
      totalValue += valuation.current_value;
      byAssetClass[holding.asset_class] = (byAssetClass[holding.asset_class] ?? 0) + valuation.current_value;
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
    };
  });

  return json({ total_value: totalValue, by_asset_class: byAssetClass, holdings });
});

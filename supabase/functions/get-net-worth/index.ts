// Plain data query, no AI involved. Build-order step 6: valuation across all
// asset classes (stock, mutual_fund, gold, real_estate, other) via the
// per-class strategy pattern in _shared/valuation.ts.
import { corsHeaders, json } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabaseAdmin.ts";
import { getValuationStrategy, type HoldingRow } from "../_shared/valuation.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createAdminClient();

  const { data: assets, error: assetsError } = await supabase
    .from("assets")
    .select("id, symbol, name, asset_class, manual_current_value");

  if (assetsError) {
    return json({ error: assetsError.message }, 500);
  }

  if (!assets || assets.length === 0) {
    return json({ total_value: 0, by_asset_class: {}, holdings: [] });
  }

  const assetIds = assets.map((a) => a.id);
  const stockSymbols = [
    ...new Set(assets.filter((a) => a.asset_class === "stock").map((a) => a.symbol).filter(Boolean)),
  ];

  const [lotsResult, pricesResult] = await Promise.all([
    supabase.from("lots").select("asset_id, quantity, buy_price").in("asset_id", assetIds),
    supabase.from("latest_prices").select("symbol, ltp, ticked_at").in("symbol", stockSymbols),
  ]);

  if (lotsResult.error) {
    return json({ error: lotsResult.error.message }, 500);
  }
  if (pricesResult.error) {
    return json({ error: pricesResult.error.message }, 500);
  }

  // Sum lots per asset — schema allows multiple lots per asset even though the
  // relay/assistant currently only ever write one (see relay-service/app/holdings_sync.py
  // and the log_transaction tool in handle-message).
  const lotsByAsset = new Map<string, { quantity: number; invested: number }>();
  for (const lot of lotsResult.data ?? []) {
    const quantity = Number(lot.quantity);
    const invested = quantity * Number(lot.buy_price);
    const existing = lotsByAsset.get(lot.asset_id);
    if (existing) {
      existing.quantity += quantity;
      existing.invested += invested;
    } else {
      lotsByAsset.set(lot.asset_id, { quantity, invested });
    }
  }

  const latestPrices = new Map<string, { ltp: number; tickedAt: string }>();
  for (const price of pricesResult.data ?? []) {
    latestPrices.set(price.symbol, { ltp: Number(price.ltp), tickedAt: price.ticked_at });
  }

  const holdingRows: HoldingRow[] = assets.map((asset) => {
    const lot = lotsByAsset.get(asset.id) ?? { quantity: 0, invested: 0 };
    return {
      asset_id: asset.id,
      symbol: asset.symbol,
      name: asset.name,
      asset_class: asset.asset_class,
      quantity: lot.quantity,
      invested_value: lot.invested,
      manual_current_value: asset.manual_current_value !== null ? Number(asset.manual_current_value) : null,
    };
  });

  const valuations = await Promise.all(
    holdingRows.map((holding) => getValuationStrategy(holding.asset_class, latestPrices).valuate(holding)),
  );

  let totalValue = 0;
  const byAssetClass: Record<string, number> = {};

  const holdings = holdingRows.map((holding, i) => {
    const valuation = valuations[i];
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

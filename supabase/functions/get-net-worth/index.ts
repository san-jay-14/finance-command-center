// Plain data query, no AI involved (build-order step 3: valuation engine for
// stocks only). Reads assets+lots+latest_prices directly; no other asset
// classes yet.
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (_req: Request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: assets, error: assetsError } = await supabase
    .from("assets")
    .select("id, symbol")
    .eq("asset_class", "stock");

  if (assetsError) {
    return Response.json({ error: assetsError.message }, { status: 500 });
  }

  if (!assets || assets.length === 0) {
    return Response.json({ total_value: 0, holdings: [] });
  }

  const assetIds = assets.map((a) => a.id);
  const symbols = [...new Set(assets.map((a) => a.symbol).filter(Boolean))];

  const [lotsResult, pricesResult] = await Promise.all([
    supabase.from("lots").select("asset_id, quantity, buy_price").in("asset_id", assetIds),
    supabase.from("latest_prices").select("symbol, ltp, ticked_at").in("symbol", symbols),
  ]);

  if (lotsResult.error) {
    return Response.json({ error: lotsResult.error.message }, { status: 500 });
  }
  if (pricesResult.error) {
    return Response.json({ error: pricesResult.error.message }, { status: 500 });
  }

  // Sum lots per asset — schema allows multiple lots per asset even though the
  // relay currently only ever writes one (see relay-service/app/holdings_sync.py).
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

  const priceBySymbol = new Map<string, { ltp: number; tickedAt: string }>();
  for (const price of pricesResult.data ?? []) {
    priceBySymbol.set(price.symbol, { ltp: Number(price.ltp), tickedAt: price.ticked_at });
  }

  let totalValue = 0;
  const holdings = assets.map((asset) => {
    const lot = lotsByAsset.get(asset.id) ?? { quantity: 0, invested: 0 };
    const price = asset.symbol ? priceBySymbol.get(asset.symbol) : undefined;
    const currentPrice = price?.ltp ?? null;
    const currentValue = currentPrice !== null ? lot.quantity * currentPrice : null;
    if (currentValue !== null) totalValue += currentValue;

    return {
      symbol: asset.symbol,
      quantity: lot.quantity,
      current_price: currentPrice,
      current_value: currentValue,
      invested_value: lot.invested,
      unrealized_pnl: currentValue !== null ? currentValue - lot.invested : null,
      price_as_of: price?.tickedAt ?? null,
    };
  });

  return Response.json({ total_value: totalValue, holdings });
});

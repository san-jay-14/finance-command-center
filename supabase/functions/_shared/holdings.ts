import type { AdminClient } from "./assets.ts";
import { getValuationStrategy, type HoldingRow, type Valuation } from "./valuation.ts";

// Valuation for a single asset, reusing the same per-class strategies
// get-net-worth uses for the full holdings list — for callers (recurring
// rules processing, projections) that only need one asset at a time.
export async function valuateSingleAsset(
  supabase: AdminClient,
  assetId: string,
): Promise<{ holding: HoldingRow; valuation: Valuation } | null> {
  const { data: asset, error } = await supabase
    .from("assets")
    .select("id, symbol, name, asset_class, manual_current_value")
    .eq("id", assetId)
    .maybeSingle();
  if (error || !asset) return null;

  const { data: lots } = await supabase.from("lots").select("quantity, buy_price").eq("asset_id", assetId);
  const quantity = (lots ?? []).reduce((sum, l) => sum + Number(l.quantity), 0);
  const invested = (lots ?? []).reduce((sum, l) => sum + Number(l.quantity) * Number(l.buy_price), 0);

  const latestPrices = new Map<string, { ltp: number; tickedAt: string; prevClose?: number | null }>();
  if (asset.asset_class === "stock" && asset.symbol) {
    const { data: priceRow } = await supabase
      .from("latest_prices")
      .select("symbol, ltp, ticked_at, prev_close")
      .eq("symbol", asset.symbol)
      .maybeSingle();
    if (priceRow) {
      latestPrices.set(priceRow.symbol, {
        ltp: Number(priceRow.ltp),
        tickedAt: priceRow.ticked_at,
        prevClose: priceRow.prev_close !== null ? Number(priceRow.prev_close) : null,
      });
    }
  }

  const holding: HoldingRow = {
    asset_id: asset.id,
    symbol: asset.symbol,
    name: asset.name,
    asset_class: asset.asset_class,
    quantity,
    invested_value: invested,
    manual_current_value: asset.manual_current_value !== null ? Number(asset.manual_current_value) : null,
  };

  const valuation = await getValuationStrategy(asset.asset_class, latestPrices).valuate(holding);
  return { holding, valuation };
}

// Valuation for multiple assets at once (optionally filtered to specific
// classes, e.g. the liquid-assets check in check-affordability). Shared by
// get-net-worth (no filter — every asset) and check-affordability (filtered
// to stock/mutual_fund/gold).
export async function valuateAssets(
  supabase: AdminClient,
  filterClasses?: string[],
): Promise<{ holding: HoldingRow; valuation: Valuation }[]> {
  let query = supabase.from("assets").select("id, symbol, name, asset_class, manual_current_value");
  if (filterClasses && filterClasses.length > 0) {
    query = query.in("asset_class", filterClasses);
  }
  const { data: assets, error } = await query;
  if (error || !assets || assets.length === 0) return [];

  const assetIds = assets.map((a) => a.id);
  const stockSymbols = [
    ...new Set(assets.filter((a) => a.asset_class === "stock").map((a) => a.symbol).filter(Boolean)),
  ];

  const [lotsResult, pricesResult] = await Promise.all([
    supabase.from("lots").select("asset_id, quantity, buy_price").in("asset_id", assetIds),
    supabase.from("latest_prices").select("symbol, ltp, ticked_at, prev_close").in("symbol", stockSymbols),
  ]);

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

  const latestPrices = new Map<string, { ltp: number; tickedAt: string; prevClose?: number | null }>();
  for (const price of pricesResult.data ?? []) {
    latestPrices.set(price.symbol, {
      ltp: Number(price.ltp),
      tickedAt: price.ticked_at,
      prevClose: price.prev_close !== null ? Number(price.prev_close) : null,
    });
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

  return holdingRows.map((holding, i) => ({ holding, valuation: valuations[i] }));
}

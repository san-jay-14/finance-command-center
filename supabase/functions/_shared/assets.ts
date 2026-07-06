import { createAdminClient } from "./supabaseAdmin.ts";

export type AdminClient = ReturnType<typeof createAdminClient>;

export const DEFAULT_ASSET_NAMES: Record<string, string> = {
  gold: "Gold",
};

export function symbolForAsset(assetClass: string, schemeCode?: string): string | null {
  if (assetClass === "gold") return "GOLD";
  if (assetClass === "mutual_fund") return schemeCode ?? null;
  return null; // real_estate / other: matched by name, not symbol
}

export async function findExistingAsset(
  supabase: AdminClient,
  userId: string,
  assetClass: string,
  assetName: string,
  symbol: string | null,
): Promise<string | null> {
  let query = supabase.from("assets").select("id").eq("user_id", userId).eq("asset_class", assetClass);
  query = symbol ? query.eq("symbol", symbol) : query.ilike("name", assetName);
  const { data, error } = await query.limit(1);
  if (error) throw new Error(error.message);
  return data && data.length > 0 ? data[0].id : null;
}

export async function findOrCreateAsset(
  supabase: AdminClient,
  userId: string,
  assetClass: string,
  assetName: string,
  symbol: string | null,
): Promise<{ id: string; created: boolean }> {
  const existingId = await findExistingAsset(supabase, userId, assetClass, assetName, symbol);
  if (existingId) return { id: existingId, created: false };

  const { data: created, error: createError } = await supabase
    .from("assets")
    .insert({ user_id: userId, broker_connection_id: null, symbol, name: assetName, asset_class: assetClass })
    .select("id")
    .single();
  if (createError) throw new Error(createError.message);
  return { id: created.id, created: true };
}

// Reduces the lot for a sale of a non-stock asset — the sell-side mirror of
// upsertLotForPurchase. Same one-lot-per-asset simplification: quantity is
// decremented (floored at 0) rather than tracking which specific lot was
// sold, since real per-lot FIFO matching is a tax-engine concern, not built
// yet. A fully-sold asset (quantity 0) is filtered out of holdings display
// in _shared/holdings.ts rather than deleted here, so a later re-purchase of
// the same name re-uses the asset row.
export async function reduceLotForSale(supabase: AdminClient, assetId: string, quantity: number): Promise<void> {
  const { data: existingLot, error: findError } = await supabase
    .from("lots")
    .select("id, quantity")
    .eq("asset_id", assetId)
    .limit(1);
  if (findError) throw new Error(findError.message);
  if (!existingLot || existingLot.length === 0) return;

  const lot = existingLot[0];
  const newQuantity = Math.max(0, Number(lot.quantity) - quantity);
  const { error: updateError } = await supabase.from("lots").update({ quantity: newQuantity }).eq("id", lot.id);
  if (updateError) throw new Error(updateError.message);
}

// One lot per asset, same simplification as the relay's holdings sync — real
// per-trade FIFO lots are a tax-engine (build-order step 8) concern.
export async function upsertLotForPurchase(
  supabase: AdminClient,
  assetId: string,
  quantity: number,
  amount: number,
): Promise<void> {
  const { data: existingLot, error: findError } = await supabase
    .from("lots")
    .select("id, quantity, buy_price")
    .eq("asset_id", assetId)
    .limit(1);
  if (findError) throw new Error(findError.message);

  if (existingLot && existingLot.length > 0) {
    const lot = existingLot[0];
    const oldQuantity = Number(lot.quantity);
    const oldInvested = oldQuantity * Number(lot.buy_price);
    const newQuantity = oldQuantity + quantity;
    const newInvested = oldInvested + amount;
    const newBuyPrice = newQuantity !== 0 ? newInvested / newQuantity : amount;
    const { error: updateError } = await supabase
      .from("lots")
      .update({ quantity: newQuantity, buy_price: newBuyPrice })
      .eq("id", lot.id);
    if (updateError) throw new Error(updateError.message);
  } else {
    const buyPrice = quantity !== 0 ? amount / quantity : amount;
    const { error: insertError } = await supabase.from("lots").insert({
      asset_id: assetId,
      quantity,
      buy_price: buyPrice,
      buy_date: new Date().toISOString().slice(0, 10),
    });
    if (insertError) throw new Error(insertError.message);
  }
}

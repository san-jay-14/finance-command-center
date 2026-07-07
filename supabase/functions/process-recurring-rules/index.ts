// Build-order step 7: recurring contribution engine. Meant to be called
// daily by pg_cron (see supabase/migrations for the schedule), but is a
// plain HTTP endpoint so it can also be triggered manually for testing.
import { DEFAULT_ASSET_NAMES, findOrCreateAsset, symbolForAsset, upsertLotForPurchase } from "../_shared/assets.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { advanceDate, today } from "../_shared/dates.ts";
import { valuateSingleAsset } from "../_shared/holdings.ts";
import { broadcastRealtime } from "../_shared/realtimeBroadcast.ts";
import { createAdminClient } from "../_shared/supabaseAdmin.ts";

const TRANSACTIONS_TOPIC = "transactions";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createAdminClient();
  const todayStr = today();

  const { data: dueRules, error: dueError } = await supabase
    .from("recurring_rules")
    .select("*")
    .eq("active", true)
    .lte("next_run_date", todayStr);

  if (dueError) {
    return json({ error: dueError.message }, 500);
  }

  const results: Array<Record<string, unknown>> = [];

  for (const rule of dueRules ?? []) {
    const newNextRunDate = advanceDate(rule.next_run_date, rule.frequency);

    // Atomically "claim" this rule by advancing next_run_date only if it's
    // still what we just read. If another invocation already claimed it
    // (e.g. the function was triggered twice today), this update affects
    // zero rows and we skip — that's the idempotency guard.
    const { data: claimed, error: claimError } = await supabase
      .from("recurring_rules")
      .update({ next_run_date: newNextRunDate })
      .eq("id", rule.id)
      .eq("next_run_date", rule.next_run_date)
      .select()
      .maybeSingle();

    if (claimError) {
      results.push({ rule_id: rule.id, status: "error", reason: claimError.message });
      continue;
    }
    if (!claimed) {
      results.push({ rule_id: rule.id, status: "skipped", reason: "already processed (next_run_date already advanced)" });
      continue;
    }

    try {
      let assetId: string | null = rule.asset_id;
      if (!assetId) {
        // First run for this rule — create the asset now, not at rule-creation time.
        const assetName = DEFAULT_ASSET_NAMES[rule.asset_class] ?? rule.asset_class;
        const symbol = symbolForAsset(rule.asset_class);
        const asset = await findOrCreateAsset(supabase, rule.user_id, rule.asset_class, assetName, symbol);
        assetId = asset.id;
        await supabase.from("recurring_rules").update({ asset_id: assetId }).eq("id", rule.id);
      }

      const amount = Number(rule.amount);
      const info = await valuateSingleAsset(supabase, assetId);
      const currentPrice = info?.valuation.current_price ?? null;
      // For real_estate/other there's no meaningful per-unit price — treat
      // the contribution like the initial purchase convention (quantity 1).
      const quantity = currentPrice && currentPrice > 0 ? amount / currentPrice : 1;

      await upsertLotForPurchase(supabase, assetId, quantity, amount);

      const { data: txn, error: txnError } = await supabase
        .from("transactions")
        .insert({ user_id: rule.user_id, asset_id: assetId, action: "buy", quantity, amount, source: "system" })
        .select()
        .single();
      if (txnError) throw new Error(txnError.message);

      await broadcastRealtime(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        TRANSACTIONS_TOPIC,
        "new",
        {
          action: "buy",
          quantity,
          amount,
          asset_name: info?.holding.name ?? DEFAULT_ASSET_NAMES[rule.asset_class] ?? rule.asset_class,
          asset_class: rule.asset_class,
          source: "system",
        },
      );

      results.push({
        rule_id: rule.id,
        status: "processed",
        asset_id: assetId,
        transaction_id: txn.id,
        quantity,
        unit_price: currentPrice,
        previous_next_run_date: rule.next_run_date,
        new_next_run_date: newNextRunDate,
      });
    } catch (err) {
      results.push({ rule_id: rule.id, status: "error", reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return json({ checked: (dueRules ?? []).length, processed: results.filter((r) => r.status === "processed").length, results });
});

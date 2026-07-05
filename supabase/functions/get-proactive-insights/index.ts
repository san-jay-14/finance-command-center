// Proactive insights briefing — not part of the original build order.
// Compares the portfolio's current state against a snapshot taken at the
// user's last dashboard visit (financial_profile.last_snapshot) and surfaces
// at most 2 ranked, natural-language insights. Tax-engine-dependent
// categories (e.g. realized-gain notices) are skipped since that engine
// isn't built yet.
import { corsHeaders, json } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabaseAdmin.ts";
import { valuateAssets } from "../_shared/holdings.ts";

// Configurable thresholds — tune here, not buried in the detection logic.
const STOCK_MOVE_THRESHOLD = 0.03; // 3% move on a single held stock
const PORTFOLIO_MOVE_THRESHOLD = 0.02; // 2% move on total portfolio value
const ALLOCATION_CONCENTRATION_THRESHOLD = 0.4; // 40% of net worth in one asset class
const EMERGENCY_FUND_PROXIMITY_RATIO = 0.1; // margin within 10% of the required buffer counts as "close"

type Snapshot = {
  total_value: number;
  by_asset_class: Record<string, number>;
  liquid_assets: number;
  holdings: Record<string, number>;
};

type Insight = { priority: number; text: string };

function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Valuation math (NAV/gold-rate conversions) produces long floats — round to
// whole rupees for display so amounts don't show stray decimals like ₹34,786.708.
function money(n: number): string {
  return Math.round(n).toLocaleString("en-IN");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Use POST" }, 405);
  }

  let body: { user_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { user_id } = body;
  if (!user_id) {
    return json({ error: "user_id is required" }, 400);
  }

  const supabase = createAdminClient();

  const { data: profile, error: profileError } = await supabase
    .from("financial_profile")
    .select("*")
    .eq("user_id", user_id)
    .maybeSingle();
  if (profileError) return json({ error: profileError.message }, 500);

  const lastSeenAt: string | null = profile?.last_seen_at ?? null;
  const previousSnapshot: Snapshot | null = profile?.last_snapshot ?? null;

  const rows = await valuateAssets(supabase);
  let totalValue = 0;
  let liquidAssets = 0;
  const byAssetClass: Record<string, number> = {};
  const holdingsMap: Record<string, number> = {};

  for (const { holding, valuation } of rows) {
    const value = valuation.current_value ?? 0;
    totalValue += value;
    byAssetClass[holding.asset_class] = (byAssetClass[holding.asset_class] ?? 0) + value;
    holdingsMap[holding.asset_id] = value;
    if (holding.asset_class === "stock" || holding.asset_class === "mutual_fund" || holding.asset_class === "gold") {
      liquidAssets += value;
    }
  }

  const currentSnapshot: Snapshot = { total_value: totalValue, by_asset_class: byAssetClass, liquid_assets: liquidAssets, holdings: holdingsMap };

  const insights: Insight[] = [];

  // Bootstrap: first-ever visit has nothing to compare against. Save a
  // baseline and show nothing rather than guessing against a missing history.
  if (lastSeenAt && previousSnapshot) {
    // --- 1. Recurring rules fired since last visit ---
    const { data: systemTxns } = await supabase
      .from("transactions")
      .select("asset_id, amount, created_at")
      .eq("user_id", user_id)
      .eq("source", "system")
      .gt("created_at", lastSeenAt);

    if (systemTxns && systemTxns.length > 0) {
      const byAsset = new Map<string, { amount: number; count: number }>();
      for (const t of systemTxns) {
        if (!t.asset_id) continue;
        const agg = byAsset.get(t.asset_id) ?? { amount: 0, count: 0 };
        agg.amount += Number(t.amount);
        agg.count += 1;
        byAsset.set(t.asset_id, agg);
      }
      let topAssetId: string | null = null;
      let topAmount = -Infinity;
      for (const [assetId, agg] of byAsset) {
        if (agg.amount > topAmount) {
          topAmount = agg.amount;
          topAssetId = assetId;
        }
      }
      if (topAssetId) {
        const agg = byAsset.get(topAssetId)!;
        const holdingEntry = rows.find((r) => r.holding.asset_id === topAssetId);
        const { data: rule } = await supabase
          .from("recurring_rules")
          .select("frequency")
          .eq("asset_id", topAssetId)
          .eq("user_id", user_id)
          .maybeSingle();

        const name = holdingEntry?.holding.name ?? "your holding";
        const freqWord = rule?.frequency ?? "recurring";
        const runPhrase = agg.count > 1 ? `ran ${agg.count} times, contributing ₹${money(agg.amount)} total` : `ran, contributing ₹${money(agg.amount)}`;
        let text = `Your ${freqWord} ${name} contribution ${runPhrase}`;
        if (holdingEntry && totalValue > 0) {
          const pct = ((byAssetClass[holdingEntry.holding.asset_class] ?? 0) / totalValue) * 100;
          const pctText = pct < 1 ? pct.toFixed(1) : pct.toFixed(0);
          text += `, ${titleCase(holdingEntry.holding.asset_class)} is now ${pctText}% of your portfolio`;
        }
        insights.push({ priority: 1, text: `${text}.` });
      }
    }

    // --- 2. Notable price moves on held stocks (or total portfolio) ---
    let bestStockMove: { name: string; pctChange: number } | null = null;
    for (const { holding, valuation } of rows) {
      if (holding.asset_class !== "stock") continue;
      const prevValue = previousSnapshot.holdings?.[holding.asset_id];
      const currValue = valuation.current_value;
      if (prevValue == null || currValue == null || prevValue === 0) continue;
      const pctChange = (currValue - prevValue) / prevValue;
      if (Math.abs(pctChange) >= STOCK_MOVE_THRESHOLD) {
        if (!bestStockMove || Math.abs(pctChange) > Math.abs(bestStockMove.pctChange)) {
          bestStockMove = { name: holding.name, pctChange };
        }
      }
    }
    if (bestStockMove) {
      const direction = bestStockMove.pctChange > 0 ? "up" : "down";
      insights.push({
        priority: 2,
        text: `${bestStockMove.name} is ${direction} ${Math.abs(bestStockMove.pctChange * 100).toFixed(1)}% since your last visit.`,
      });
    } else if (previousSnapshot.total_value > 0) {
      const portfolioPct = (totalValue - previousSnapshot.total_value) / previousSnapshot.total_value;
      if (Math.abs(portfolioPct) >= PORTFOLIO_MOVE_THRESHOLD) {
        const direction = portfolioPct > 0 ? "up" : "down";
        insights.push({
          priority: 2,
          text: `Your total portfolio is ${direction} ${Math.abs(portfolioPct * 100).toFixed(1)}% since your last visit.`,
        });
      }
    }

    // --- 3. Allocation drift — crossed the concentration threshold since last visit ---
    if (totalValue > 0) {
      let bestDrift: { assetClass: string; pct: number } | null = null;
      for (const [assetClass, value] of Object.entries(byAssetClass)) {
        const pct = value / totalValue;
        if (pct < ALLOCATION_CONCENTRATION_THRESHOLD) continue;
        const prevTotal = previousSnapshot.total_value;
        const prevValue = previousSnapshot.by_asset_class?.[assetClass] ?? 0;
        const prevPct = prevTotal > 0 ? prevValue / prevTotal : 0;
        if (prevPct >= ALLOCATION_CONCENTRATION_THRESHOLD) continue; // already crossed before — not new
        if (!bestDrift || pct > bestDrift.pct) bestDrift = { assetClass, pct };
      }
      if (bestDrift) {
        insights.push({
          priority: 3,
          text: `${titleCase(bestDrift.assetClass)} crossed ${Math.round(ALLOCATION_CONCENTRATION_THRESHOLD * 100)}% of your net worth — now at ${(bestDrift.pct * 100).toFixed(0)}%.`,
        });
      }
    }

    // --- 4. Emergency fund status change ---
    if (profile?.monthly_expenses != null) {
      const months = profile.emergency_fund_months ?? 6;
      const requiredMinimum = months * Number(profile.monthly_expenses);
      const currentMargin = liquidAssets - requiredMinimum;
      const isCloseOrBelow = currentMargin < requiredMinimum * EMERGENCY_FUND_PROXIMITY_RATIO;
      if (isCloseOrBelow) {
        const prevMargin = previousSnapshot.liquid_assets - requiredMinimum;
        const wasAlreadyClose = prevMargin < requiredMinimum * EMERGENCY_FUND_PROXIMITY_RATIO;
        if (!wasAlreadyClose) {
          const text =
            currentMargin < 0
              ? `Your liquid assets have dropped below your ${months}-month emergency buffer by ₹${money(Math.abs(currentMargin))}.`
              : `Your emergency fund cushion is thinning — only ₹${money(currentMargin)} above your ${months}-month buffer.`;
          insights.push({ priority: 4, text });
        }
      }
    }
  }

  insights.sort((a, b) => a.priority - b.priority);
  const topInsights = insights.slice(0, 2).map((i) => i.text);

  // Persist the new baseline only after insights have been computed from the
  // OLD baseline above — updating first would compare the snapshot against
  // itself and always find nothing.
  const { error: upsertError } = await supabase
    .from("financial_profile")
    .upsert({ user_id, last_seen_at: new Date().toISOString(), last_snapshot: currentSnapshot }, { onConflict: "user_id" });
  if (upsertError) return json({ error: upsertError.message }, 500);

  return json({ insights: topInsights });
});

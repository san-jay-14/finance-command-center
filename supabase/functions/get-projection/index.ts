// Build-order step 7: projection helper ("at this rate, in 12 months this
// holding will be worth approximately ₹X"). Exposed as its own endpoint so a
// future "show my gold projection" query can use it — not wired into
// render_ui yet, that's a later nice-to-have.
import { corsHeaders, json } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabaseAdmin.ts";
import { valuateSingleAsset } from "../_shared/holdings.ts";
import { monthlyEquivalent, projectTwelveMonths } from "../_shared/projection.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const ruleId = url.searchParams.get("rule_id");
  if (!ruleId) {
    return json({ error: "rule_id query param is required" }, 400);
  }

  const supabase = createAdminClient();
  const { data: rule, error } = await supabase.from("recurring_rules").select("*").eq("id", ruleId).maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!rule) return json({ error: `No recurring_rules row with id ${ruleId}` }, 404);

  let currentValue = 0;
  if (rule.asset_id) {
    const info = await valuateSingleAsset(supabase, rule.asset_id);
    currentValue = info?.valuation.current_value ?? 0;
  }

  const amount = Number(rule.amount);

  return json({
    rule_id: rule.id,
    asset_class: rule.asset_class,
    asset_id: rule.asset_id,
    current_value: currentValue,
    monthly_contribution_equivalent: monthlyEquivalent(amount, rule.frequency),
    projected_value_in_12_months: projectTwelveMonths(currentValue, amount, rule.frequency),
    note:
      "Simplification: assumes no price appreciation on the holding itself — just today's current value plus 12 months of future contributions.",
  });
});

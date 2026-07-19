// Build-order step 9: affordability engine, exactly the three checks from
// PROJECT_BRIEF.md section 5. Output is structured (pass/fail/skip + margins),
// not a blunt yes/no — handle-message's check_affordability tool turns this
// into natural language.
import { corsHeaders, json } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabaseAdmin.ts";
import { valuateAssets } from "../_shared/holdings.ts";
import { computeFoir, FOIR_LIMIT } from "../_shared/foir.ts";

// Configurable assumptions for the opportunity-cost note — not buried deep
// in the calculation below.
const ASSUMED_ANNUAL_RETURN = 0.12; // 12%, a common assumption for Indian equity
const OPPORTUNITY_COST_YEARS = 5;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Use POST" }, 405);
  }

  let body: { owner_id?: string; purchase_amount?: number; new_emi?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // owner_id (Supabase Auth) — Step 9. Only caller is handle-message, which
  // derives this from the caller's verified JWT, never trusts client input.
  const { owner_id, purchase_amount, new_emi } = body;
  if (!owner_id || purchase_amount == null) {
    return json({ error: "owner_id and purchase_amount are required" }, 400);
  }

  const supabase = createAdminClient();

  const { data: profile, error: profileError } = await supabase
    .from("financial_profile")
    .select("*")
    .eq("owner_id", owner_id)
    .maybeSingle();
  if (profileError) return json({ error: profileError.message }, 500);

  // --- 1. Emergency fund check: liquid assets (stock+MF+gold) must not drop
  // below emergency_fund_months of monthly_expenses. ---
  const liquidHoldings = await valuateAssets(supabase, ["stock", "mutual_fund", "gold"], owner_id);
  const liquidAssetsBefore = liquidHoldings.reduce((sum, h) => sum + (h.valuation.current_value ?? 0), 0);
  const liquidAssetsAfter = liquidAssetsBefore - purchase_amount;

  let emergencyFundCheck: Record<string, unknown>;
  if (!profile || profile.monthly_expenses == null) {
    emergencyFundCheck = { status: "unavailable", reason: "monthly_expenses not set in financial_profile yet" };
  } else {
    const emergencyFundMonths = profile.emergency_fund_months ?? 6;
    const requiredMinimum = emergencyFundMonths * Number(profile.monthly_expenses);
    const margin = liquidAssetsAfter - requiredMinimum;
    emergencyFundCheck = {
      status: margin >= 0 ? "pass" : "fail",
      liquid_assets_before: liquidAssetsBefore,
      liquid_assets_after: liquidAssetsAfter,
      required_minimum: requiredMinimum,
      emergency_fund_months: emergencyFundMonths,
      margin,
    };
  }

  // --- 2. FOIR / 40% check: only relevant if financed (new_emi given). ---
  let foirCheck: Record<string, unknown>;
  if (new_emi == null || new_emi <= 0) {
    foirCheck = { status: "skipped", reason: "no financing (new_emi not provided) — treated as a cash purchase" };
  } else if (!profile || profile.monthly_income == null) {
    foirCheck = { status: "unavailable", reason: "monthly_income not set in financial_profile yet" };
  } else {
    let standing;
    try {
      standing = await computeFoir(supabase, owner_id, profile);
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
    const monthlyIncome = standing.monthly_income!;
    const totalCommitments = standing.total_commitments + new_emi;
    const foirRatio = monthlyIncome > 0 ? totalCommitments / monthlyIncome : null;

    foirCheck = {
      status: foirRatio !== null && foirRatio < FOIR_LIMIT ? "pass" : "fail",
      existing_emis: standing.existing_emis,
      existing_recurring_commitments: standing.existing_recurring_commitments,
      new_emi,
      monthly_income: monthlyIncome,
      foir_ratio: foirRatio,
      limit: FOIR_LIMIT,
    };
  }

  // --- 3. Opportunity cost note: informational only, never blocking. ---
  const projectedValue = purchase_amount * Math.pow(1 + ASSUMED_ANNUAL_RETURN, OPPORTUNITY_COST_YEARS);
  const opportunityCost = {
    purchase_amount,
    assumed_annual_return: ASSUMED_ANNUAL_RETURN,
    years: OPPORTUNITY_COST_YEARS,
    projected_value_if_invested: projectedValue,
    note: `If left invested at an assumed ${ASSUMED_ANNUAL_RETURN * 100}%/year, this amount would grow to approximately this much in ${OPPORTUNITY_COST_YEARS} years. Informational only — never blocking.`,
  };

  return json({
    purchase_amount,
    checks: {
      emergency_fund: emergencyFundCheck,
      foir: foirCheck,
      opportunity_cost: opportunityCost,
    },
  });
});

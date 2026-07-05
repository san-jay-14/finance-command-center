// Backing data for the base dashboard layout: income/EMI strip (standing
// FOIR via the same shared helper check-affordability uses), the activity
// log, and the upcoming column. Holdings/net worth come from get-net-worth —
// this function deliberately doesn't duplicate that.
import { corsHeaders, json } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabaseAdmin.ts";
import { computeFoir, FOIR_LIMIT } from "../_shared/foir.ts";
import { advanceDate } from "../_shared/dates.ts";

const ACTIVITY_LIMIT = 25;
// Each recurring rule contributes its next few run dates, so the upcoming
// column reads as a real schedule instead of one lonely row. Broker order
// book and GTT rules would merge into this same list — neither exists yet
// (order execution deferred; GTT dropped from scope).
const OCCURRENCES_PER_RULE = 4;
const UPCOMING_LIMIT = 12;

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
    .select("name, age, monthly_income, monthly_expenses, existing_emis, emergency_fund_months")
    .eq("user_id", user_id)
    .maybeSingle();
  if (profileError) return json({ error: profileError.message }, 500);

  let foir;
  try {
    foir = await computeFoir(supabase, user_id, profile);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }

  const { data: transactions, error: txnError } = await supabase
    .from("transactions")
    .select("id, action, quantity, amount, source, created_at, assets(name, asset_class, symbol)")
    .eq("user_id", user_id)
    .order("created_at", { ascending: false })
    .limit(ACTIVITY_LIMIT);
  if (txnError) return json({ error: txnError.message }, 500);

  const activity = (transactions ?? []).map((t) => {
    const asset = t.assets as { name?: string; asset_class?: string; symbol?: string } | null;
    return {
      id: t.id,
      action: t.action,
      quantity: t.quantity !== null ? Number(t.quantity) : null,
      amount: Number(t.amount),
      source: t.source,
      created_at: t.created_at,
      asset_name: asset?.name ?? null,
      asset_class: asset?.asset_class ?? null,
      symbol: asset?.symbol ?? null,
    };
  });

  const { data: rules, error: rulesError } = await supabase
    .from("recurring_rules")
    .select("id, asset_class, amount, frequency, next_run_date")
    .eq("user_id", user_id)
    .eq("active", true);
  if (rulesError) return json({ error: rulesError.message }, 500);

  const upcoming: Array<Record<string, unknown>> = [];
  for (const rule of rules ?? []) {
    let date = rule.next_run_date as string;
    for (let i = 0; i < OCCURRENCES_PER_RULE; i++) {
      upcoming.push({
        type: "recurring",
        rule_id: rule.id,
        asset_class: rule.asset_class,
        amount: Number(rule.amount),
        frequency: rule.frequency,
        date,
      });
      date = advanceDate(date, rule.frequency);
    }
  }
  upcoming.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return json({
    profile: {
      name: profile?.name ?? null,
      age: profile?.age ?? null,
      monthly_income: profile?.monthly_income !== null && profile?.monthly_income !== undefined ? Number(profile.monthly_income) : null,
      monthly_expenses: profile?.monthly_expenses !== null && profile?.monthly_expenses !== undefined ? Number(profile.monthly_expenses) : null,
      existing_emis: Number(profile?.existing_emis ?? 0),
      foir_ratio: foir.foir_ratio,
      foir_recurring_commitments: foir.existing_recurring_commitments,
      foir_limit: FOIR_LIMIT,
    },
    activity,
    upcoming: upcoming.slice(0, UPCOMING_LIMIT),
  });
});

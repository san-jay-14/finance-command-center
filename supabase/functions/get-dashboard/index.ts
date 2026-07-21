// Backing data for the base dashboard layout: income/EMI strip (standing
// FOIR via the same shared helper check-affordability uses), the activity
// log, and the upcoming column. Holdings/net worth come from get-net-worth —
// this function deliberately doesn't duplicate that.
//
// Two callers, two scopes: a `user_id` body param (legacy, pre-Supabase-Auth
// founder path) vs. a bearer JWT (a signed-in, broker-connected visitor —
// same per-owner data handle-message/get-net-worth-connected use). Kept as
// one function with a resolved `scope` rather than two, since the query
// shape is identical either way — only the filter column differs.
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

// The i-th upcoming occurrence of a monthly obligation that falls on `day`
// (e.g. day 5). i=0 is the next such date that hasn't passed yet; each
// subsequent i advances one month. Returns an ISO yyyy-mm-dd string.
function nthUpcomingMonthlyDate(day: number, i: number): string {
  const now = new Date();
  // Start from this month's `day`; if it's already past, roll to next month.
  const year = now.getUTCFullYear();
  let month = now.getUTCMonth();
  if (now.getUTCDate() > day) month += 1;
  month += i;
  // Date.UTC normalizes month overflow (e.g. month 13 → next year, Feb).
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Use POST" }, 405);
  }

  let body: { user_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Bearer-JWT callers (a connected visitor) send no body at all —
    // Authorization is the only scope they supply.
  }

  const supabase = createAdminClient();

  // scope.column is whichever FK actually carries data for this caller:
  // legacy `user_id` (public.users, pre-Auth) if given explicitly, else the
  // Step 9 `owner_id` (auth.users) derived from a verified JWT. Never both,
  // never guessed — a bearer token always wins if user_id is absent, and an
  // absent/invalid token with no user_id is a hard 400/401, not a silent
  // empty-scope query that could return every row without owner filtering.
  let scope: { column: "user_id" | "owner_id"; value: string };
  if (body.user_id) {
    scope = { column: "user_id", value: body.user_id };
  } else {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "user_id or an Authorization header is required" }, 400);
    }
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData.user) {
      return json({ error: "Invalid or expired session" }, 401);
    }
    scope = { column: "owner_id", value: userData.user.id };
  }

  const { data: profile, error: profileError } = await supabase
    .from("financial_profile")
    .select("name, age, monthly_income, monthly_expenses, existing_emis, emergency_fund_months")
    .eq(scope.column, scope.value)
    .maybeSingle();
  if (profileError) return json({ error: profileError.message }, 500);

  let foir;
  try {
    foir = await computeFoir(supabase, scope.value, profile);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }

  const { data: transactions, error: txnError } = await supabase
    .from("transactions")
    .select("id, action, quantity, amount, source, created_at, assets(name, asset_class, symbol)")
    .eq(scope.column, scope.value)
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
    .eq(scope.column, scope.value)
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

  // Existing EMIs are a standing monthly obligation stored as a single number
  // on financial_profile (not a recurring_rules row), so they never appeared
  // in this schedule even though they're the most concrete monthly commitment
  // a user has. Surface them here as their own monthly line. There's no stored
  // due-day, so occurrences land on the 5th — the same convention SIP demo
  // dates use — starting with the next 5th that hasn't passed.
  const existingEmis = Number(profile?.existing_emis ?? 0);
  if (existingEmis > 0) {
    for (let i = 0; i < OCCURRENCES_PER_RULE; i++) {
      upcoming.push({
        type: "emi",
        rule_id: `emi-${i}`,
        asset_class: "emi",
        amount: existingEmis,
        frequency: "monthly",
        date: nthUpcomingMonthlyDate(5, i),
      });
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

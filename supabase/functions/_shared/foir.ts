// FOIR (fixed obligation to income ratio) — the single source of truth for
// the 40% rule from PROJECT_BRIEF.md section 5. check-affordability layers a
// proposed new EMI on top of this; the dashboard's income/EMI strip shows the
// standing ratio as-is. Both must agree, so neither recomputes it locally.
import type { AdminClient } from "./assets.ts";
import { monthlyEquivalent } from "./projection.ts";

export const FOIR_LIMIT = 0.4; // 40%

export type FoirBreakdown = {
  monthly_income: number | null;
  existing_emis: number;
  existing_recurring_commitments: number;
  total_commitments: number;
  foir_ratio: number | null;
};

// ownerId here is Supabase Auth (Step 9) — check-affordability's only
// caller — not the legacy user_id (public.users).
export async function computeFoir(
  supabase: AdminClient,
  ownerId: string,
  profile: { monthly_income?: number | string | null; existing_emis?: number | string | null } | null,
): Promise<FoirBreakdown> {
  const { data: rules, error } = await supabase
    .from("recurring_rules")
    .select("amount, frequency")
    .eq("owner_id", ownerId)
    .eq("active", true);
  if (error) throw new Error(error.message);

  const existingRecurringCommitments = (rules ?? []).reduce(
    (sum, r) => sum + monthlyEquivalent(Number(r.amount), r.frequency),
    0,
  );
  const existingEmis = Number(profile?.existing_emis ?? 0);
  const monthlyIncome = profile?.monthly_income != null ? Number(profile.monthly_income) : null;
  const totalCommitments = existingEmis + existingRecurringCommitments;

  return {
    monthly_income: monthlyIncome,
    existing_emis: existingEmis,
    existing_recurring_commitments: existingRecurringCommitments,
    total_commitments: totalCommitments,
    foir_ratio: monthlyIncome !== null && monthlyIncome > 0 ? totalCommitments / monthlyIncome : null,
  };
}

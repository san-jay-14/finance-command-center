-- Step 9: per-visitor data isolation for the voice assistant's write path.
-- Adds a nullable owner_id (Supabase Auth) alongside the existing legacy
-- user_id (public.users, predates Supabase Auth) rather than replacing it —
-- per explicit decision, the founder's existing real data stays exactly as
-- it is (owner_id IS NULL, reachable only via the existing no-auth
-- service-role edge-function paths), while every signed-in visitor going
-- forward gets their own fresh, isolated rows (owner_id = their real
-- auth.users.id).
alter table public.assets add column owner_id uuid references auth.users(id) on delete cascade;
alter table public.transactions add column owner_id uuid references auth.users(id) on delete cascade;
alter table public.recurring_rules add column owner_id uuid references auth.users(id) on delete cascade;
alter table public.income_streams add column owner_id uuid references auth.users(id) on delete cascade;
alter table public.pending_intents add column owner_id uuid references auth.users(id) on delete cascade;
alter table public.financial_profile add column owner_id uuid references auth.users(id) on delete cascade;

create policy "owners manage their own assets" on public.assets for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owners manage their own transactions" on public.transactions for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owners manage their own recurring_rules" on public.recurring_rules for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owners manage their own income_streams" on public.income_streams for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owners manage their own pending_intents" on public.pending_intents for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owners manage their own financial_profile" on public.financial_profile for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- lots has no direct owner_id — ownership is inherited via its asset_id FK
-- to assets, which is now owner-scoped. A policy here would need a subquery
-- join back to assets; skipped since every access path to lots already
-- goes through service-role edge functions that scope by asset_id
-- correctly (see _shared/holdings.ts valuateAssets), same as before this
-- migration for the legacy data.

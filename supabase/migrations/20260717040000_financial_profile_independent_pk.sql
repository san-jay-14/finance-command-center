-- financial_profile's primary key was user_id itself (public.users, not
-- nullable) — a new per-visitor row has no legacy user_id, so it would
-- violate that PK. Give the table an independent id PK instead; the
-- existing row keeps its user_id value exactly as-is (now nullable, still
-- queryable via .eq("user_id", ...) exactly as before), owner_id becomes
-- the uniqueness constraint for the new per-visitor path.
alter table public.financial_profile add column id uuid default gen_random_uuid();
update public.financial_profile set id = gen_random_uuid() where id is null;
alter table public.financial_profile alter column id set not null;
alter table public.financial_profile drop constraint financial_profile_pkey;
alter table public.financial_profile add primary key (id);
alter table public.financial_profile alter column user_id drop not null;
alter table public.financial_profile add constraint financial_profile_owner_id_unique unique (owner_id);

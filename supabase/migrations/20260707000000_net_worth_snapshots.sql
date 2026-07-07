-- Backs the new net-worth trend chart (replaces the Income card content).
-- One row per day: get-net-worth upserts today's total on every call, so a
-- real history accumulates naturally from here on — no synthetic/backfilled
-- data, matching this project's no-mocking convention. Single-user v1, same
-- as assets/transactions: RLS enabled with no policies, so only the
-- service-role key (used by Edge Functions) can touch this table.
create table net_worth_snapshots (
  snapshot_date date primary key,
  total_value numeric not null,
  created_at timestamptz not null default now()
);
alter table net_worth_snapshots enable row level security;

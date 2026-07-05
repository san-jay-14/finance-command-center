-- Proactive insights briefing (not in the original build order): tracks
-- when the user last saw the dashboard and a snapshot of their portfolio
-- state at that time, so get-proactive-insights can detect what changed
-- since then (price moves, allocation drift, emergency fund proximity)
-- without needing a separate historical-price table.
alter table financial_profile
  add column if not exists last_seen_at timestamptz,
  add column if not exists last_snapshot jsonb;

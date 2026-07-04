-- Supports the relay service's holdings sync (build-order step 3) and the
-- get-net-worth Edge Function's price lookups.

-- Lets the relay upsert one asset per (user, symbol, asset_class) instead of
-- creating duplicates on every sync.
alter table assets
  add constraint assets_user_symbol_class_unique unique (user_id, symbol, asset_class);

-- TEMPORARY: enforces "one lot per asset" to match the relay's current
-- simplification (aggregate quantity/average price from Angel One's holdings
-- API, not real per-trade lots). Drop this constraint when the tax engine
-- (build-order step 8) introduces true FIFO lot tracking with multiple lots
-- per asset.
alter table lots
  add constraint lots_asset_unique unique (asset_id);

-- Latest known price per symbol, upserted by the relay on every WebSocket
-- tick. Realtime broadcast alone isn't queryable after the fact, so the
-- get-net-worth Edge Function reads current prices from here.
create table latest_prices (
  symbol text primary key,
  ltp numeric not null,
  ticked_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table latest_prices enable row level security;

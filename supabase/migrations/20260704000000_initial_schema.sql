-- Initial schema for the Voice-Controlled Personal Finance Command Center.
-- Source: PROJECT_BRIEF.md, section 4. Not applied yet — scaffolding only.

create extension if not exists pg_cron;

create table users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

create table broker_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  broker_name text not null, -- 'angel_one', 'zerodha', etc.
  client_code text not null,
  totp_secret_vault_id uuid, -- reference into Supabase Vault
  session_token text,
  refresh_token text,
  feed_token text,
  session_expires_at timestamptz,
  created_at timestamptz default now()
);

create table assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  broker_connection_id uuid references broker_connections(id), -- null for manual assets
  symbol text,               -- null for real estate/other
  name text not null,
  asset_class text not null check (asset_class in ('stock','mutual_fund','gold','real_estate','other')),
  created_at timestamptz default now()
);

create table lots (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references assets(id),
  quantity numeric not null,
  buy_price numeric not null,
  buy_date date not null,
  created_at timestamptz default now()
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  asset_id uuid references assets(id),
  action text not null check (action in ('buy','sell','manual_entry')),
  quantity numeric,
  amount numeric not null,
  source text not null check (source in ('voice','manual','system')),
  created_at timestamptz default now()
);

create table recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  asset_class text not null,
  asset_id uuid references assets(id), -- nullable if rule creates a new asset each run
  amount numeric not null,
  frequency text not null check (frequency in ('daily','weekly','monthly')),
  next_run_date date not null,
  active boolean default true,
  created_at timestamptz default now()
);

create table income_streams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  asset_id uuid references assets(id), -- e.g. the rental property
  amount numeric not null,
  frequency text not null,
  created_at timestamptz default now()
);

create table pending_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  context jsonb not null, -- partially resolved command awaiting clarification
  question text not null,
  created_at timestamptz default now(),
  resolved boolean default false
);

create table financial_profile (
  user_id uuid primary key references users(id),
  monthly_income numeric,
  monthly_expenses numeric,
  existing_emis numeric default 0,
  emergency_fund_months integer default 6 -- confirmed: 6 months
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  event_type text not null, -- 'order_attempt','order_confirmed','order_executed','order_failed'
  payload jsonb not null,
  created_at timestamptz default now()
);

-- Enable RLS on every table above, even for single-user v1.
-- Enable pg_cron extension for the recurring_rules scheduler.

alter table users enable row level security;
alter table broker_connections enable row level security;
alter table assets enable row level security;
alter table lots enable row level security;
alter table transactions enable row level security;
alter table recurring_rules enable row level security;
alter table income_streams enable row level security;
alter table pending_intents enable row level security;
alter table financial_profile enable row level security;
alter table audit_log enable row level security;

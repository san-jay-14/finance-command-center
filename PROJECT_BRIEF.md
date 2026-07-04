# Project Brief: Voice-Controlled Personal Finance Command Center

Hand this file to Claude Code as the starting context for implementation. It captures every product and architecture decision already made — treat these as settled, not open questions, unless something below is genuinely infeasible once you're in the code.

---

## 1. What this is

A single-page, sidebar-free personal finance dashboard for one user (me), showing total net worth across stocks, mutual funds, gold, real estate, and other assets — controlled primarily through a voice/text assistant. The assistant can:

1. **Mutate state** — "I bought 1 gram of gold" → logs a transaction
2. **Create standing rules** — "I'm investing 3k in gold every month" → recurring contribution rule
3. **Answer questions with dynamic UI** — "show my asset distribution" / "compare TSLA vs NVDA" → renders the right chart in a central canvas, no fixed pages
4. **Reason about decisions** — "can I afford this car?" → runs an affordability check against real financial rules; "sell 5 TSLA" → tax-aware confirmation before executing

Broker integration starts with **Angel One SmartAPI**, but must be built behind a broker-agnostic interface so other brokers (Zerodha, Upstox) can be added later without touching business logic.

---

## 2. Tech stack (decided, do not re-litigate)

- **Frontend:** React + TypeScript + Tailwind
- **Backend logic:** Supabase Edge Functions (Deno/TypeScript) — Claude tool-use loop, tax engine, affordability engine, valuation engine
- **Relay service:** small always-on Python service (FastAPI), hosted separately (Railway/Render/small VM) — the only piece that can't be serverless, because it holds the Angel One SmartAPI WebSocket connection open continuously
- **Database:** Supabase Postgres
- **Realtime:** Supabase Realtime (broadcast channels) for live price ticks + streaming responses to frontend
- **Scheduling:** `pg_cron` (Postgres extension via Supabase) for the recurring contribution engine
- **Secrets:** Supabase Vault for the Angel One TOTP secret and session tokens — never store the broker password
- **Auth:** Supabase Auth + Row Level Security on every table, even for a single user
- **AI:** Claude API, tool-use mode, for intent routing + generative UI decisions + guardrail reasoning
- **Voice input:** browser Web Speech API → text → sent to an Edge Function (no LiveKit needed, this is single-user not multi-party)

## 3. Broker: Angel One SmartAPI — implementation notes

- Login: POST with `clientcode`, `pin`, and a TOTP code generated via `pyotp` from a stored TOTP secret
- Returns: `authToken` (JWT), `refreshToken`, and a separate `feedToken` (used only for the WebSocket, not REST calls)
- **Session expires at midnight regardless of activity** — the relay service needs a scheduled re-login shortly after midnight, not just refresh-token renewal
- WebSocket feed: `wss://smartapisocket.angelone.in/smart-stream` — subscribe to all held symbols in one connection, don't open one connection per symbol
- Rate limits apply per endpoint — the relay/adapter should own backoff and throttling so nothing above it has to think about it
- Official Python SDK: `smartapi-python` (`pip install smartapi-python`)

### Broker adapter interface (must implement this exact shape so future brokers slot in cleanly)

```python
class BrokerAdapter(ABC):
    @abstractmethod
    async def login(self, credentials: dict) -> Session: ...
    @abstractmethod
    async def refresh_session(self, session: Session) -> Session: ...
    @abstractmethod
    async def get_holdings(self, session: Session) -> list[Holding]: ...
    @abstractmethod
    async def place_order(self, session: Session, order: OrderRequest) -> OrderResult: ...
    @abstractmethod
    async def get_order_status(self, session: Session, order_id: str) -> OrderStatus: ...
    @abstractmethod
    def subscribe_live_prices(self, session: Session, symbols: list[str], on_tick: Callable) -> None: ...
```

`AngelOneAdapter(BrokerAdapter)` is the only implementation for now. All domain logic talks to `BrokerAdapter`, never to SmartAPI directly. Normalize all data shapes (`Holding`, `OrderRequest`, `OrderResult`) as our own internal types — the adapter's job is translation, so broker-specific field names never leak upward.

---

## 4. Database schema (Postgres / Supabase) — starter DDL

```sql
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
```

---

## 5. Business logic decisions (already made, implement as specified)

### Tax engine (STCG/LTCG, FIFO)
- Sells are matched against `lots` using **FIFO** (oldest lot first)
- Holding period determines STCG vs LTCG per lot
- Track cumulative LTCG realized in the current financial year against the **₹1.25 lakh annual exemption**
- Before confirming a sell, show: which lots FIFO would consume, realized gain, STCG or LTCG classification, remaining exemption headroom, and (if close to a boundary) a concrete "wait N days to cross into long-term" suggestion

### Affordability engine ("can I afford X")
Three checks, none of them arbitrary — all based on real personal finance rules:
1. **Emergency fund check:** purchase must not drop liquid assets (stocks + MF + gold) below **6 months** of tracked monthly expenses (confirmed value, stored in `financial_profile.emergency_fund_months`)
2. **FOIR / 40% rule:** if financed, `(existing_emis + existing recurring commitments + new EMI) / monthly_income` must stay under **40%**
3. **Opportunity cost note:** always shown, never blocking — what the purchase amount would be worth if left invested instead, using the portfolio's historical average return

Output style: not a blunt yes/no — explain which checks passed/failed and by how much, then let the user decide.

### Guardrail / confirmation flow (non-negotiable)
- No tool ever both decides AND executes an irreversible action in one step
- `log_transaction` (buy/sell) returns a **proposed action** + guardrail results (tax impact / affordability) — only an explicit follow-up confirmation triggers actual broker order execution
- Ambiguous voice commands ("sell some TSLA") trigger an `ask_clarification` tool call, stored in `pending_intents`; the next user utterance is resolved against that pending context, not parsed as a fresh command

### Recurring contribution engine
- `pg_cron` checks `recurring_rules` daily for `next_run_date <= today`
- On trigger: create a `transactions` row, update the relevant `lots`, advance `next_run_date`
- Provide a projection helper: "at this rate, in 12 months this holding will be worth approximately ₹X"

### Valuation engine (per asset class, implement as a strategy pattern so new asset classes are cheap to add)
| Asset class | Live value source | "If sold today" adjustment |
|---|---|---|
| Stock | Broker WebSocket feed (via relay) | Minus STCG/LTCG tax, brokerage, STT |
| Mutual fund | NAV API (e.g. MFAPI.in, free) | Minus exit load if applicable, minus tax |
| Gold | Free gold rate API | Minus making charges/spread if physical |
| Real estate | User-entered estimate, manually updated | Minus stamp duty/brokerage on hypothetical sale |
| Other | User-entered, optional manual depreciation | As-is |

---

## 6. Generative UI contract

Claude's `render_ui` tool returns a structured spec, e.g.:
```json
{ "component": "comparison_chart", "data": { "symbols": ["TSLA","NVDA"], "range": "6M" } }
```
Frontend maintains a component registry mapping `component` string → React component. Adding a new visualization = one registry entry, not new routing logic. Known components to start with: `comparison_chart`, `asset_distribution`, `portfolio_summary`, `affordability_result`.

---

## 7. Security requirements (non-negotiable)

- Never store the broker password — only the TOTP secret and session tokens, both in Supabase Vault
- RLS enabled on every table from the start
- Execution endpoints have stricter rate limits than read endpoints
- Every order attempt (confirmed or not) logged immutably to `audit_log`
- Relay service uses a scoped service-role key, not the same key Edge Functions use broadly
- If/when a second broker is added requiring a static IP (Zerodha does, per their 2025 policy change), the relay service should already be on a fixed IP

---

## 8. Build order (follow this sequence)

1. Supabase project setup: run the schema above, enable RLS, Vault, `pg_cron`, create a Realtime channel for price ticks
2. Relay service: `BrokerAdapter` interface + `AngelOneAdapter` — login, get holdings, get live price for one symbol, push it to the Realtime channel. Get this working end-to-end before anything else.
3. Valuation engine for stocks only, as an Edge Function reading Postgres + relay's cached prices — net worth for stock holdings only, no voice yet
4. Intent router + basic Claude tool-use as an Edge Function — text input only, mutate/query intents, no guardrails yet
5. Generative UI canvas + component registry — 2-3 chart types rendering from tool calls, frontend subscribed to Realtime
6. Extend valuation engine — gold, mutual funds, manual assets
7. Recurring contribution engine — `pg_cron` job calling an Edge Function on schedule
8. Tax engine — FIFO lots, STCG/LTCG, exemption tracking
9. Affordability engine — the three-check system above
10. Voice input layer — swap text for Web Speech API, wire `pending_intents` multi-turn memory
11. Polish — confirmation state machine UI, audit log view, error handling for broker downtime/session expiry/relay restarts

---

## 9. Explicit non-goals for v1 (don't build these unless asked)

- Multi-broker support beyond the adapter interface itself (Zerodha adapter can wait)
- Alerts persisting when the dashboard tab is closed (client-side-only alerts are fine for v1)
- Live/real-money trading — build and test entirely against Angel One's real account but treat small real orders as a deliberate, later, opt-in step, not a v1 default
- Multi-user support (schema allows for it, but auth/UI doesn't need to handle it yet)

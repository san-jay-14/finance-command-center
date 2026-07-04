# Finance Command Center

A single-page, sidebar-free personal finance dashboard for tracking net worth across
stocks, mutual funds, gold, real estate, and other assets — controlled primarily
through a voice/text assistant. See [PROJECT_BRIEF.md](./PROJECT_BRIEF.md) for the
full product and architecture spec.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React + TypeScript + Tailwind |
| Backend logic | Supabase Edge Functions (Deno/TypeScript) — Claude tool-use loop, tax engine, affordability engine, valuation engine |
| Relay service | Python (FastAPI), hosted separately (Railway/Render/small VM) — holds the Angel One SmartAPI WebSocket connection open continuously |
| Database | Supabase Postgres |
| Realtime | Supabase Realtime (broadcast channels) for live price ticks + streaming responses |
| Scheduling | `pg_cron` (Postgres extension via Supabase) for the recurring contribution engine |
| Secrets | Supabase Vault for the Angel One TOTP secret and session tokens |
| Auth | Supabase Auth + Row Level Security on every table |
| AI | Claude API, tool-use mode, for intent routing + generative UI + guardrail reasoning |
| Voice input | Browser Web Speech API → text → sent to an Edge Function |

## Repository layout

```
/frontend       React + TypeScript + Tailwind app (Vite)
/relay-service  Python FastAPI relay for the Angel One SmartAPI connection
/supabase       Supabase project config + migrations
PROJECT_BRIEF.md
```

## Setup

### frontend

```
cd frontend
npm install
npm run dev
```

### relay-service

```
cd relay-service
python -m venv venv
./venv/Scripts/activate   # Windows; use `source venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
cp .env.example .env      # fill in real values, never commit .env
uvicorn app.main:app --reload --port 8000
```

### supabase

```
cd supabase
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push       # applies migrations/ to the linked project
```

## Development

See the [Makefile](./Makefile) for convenience targets (`make dev-frontend`, `make dev-relay`).

## Status

Repository scaffolding only. Follows the build order in
[PROJECT_BRIEF.md section 8](./PROJECT_BRIEF.md#8-build-order-follow-this-sequence) —
no business logic (broker adapter, tax engine, Claude tool-use) has been implemented
yet.

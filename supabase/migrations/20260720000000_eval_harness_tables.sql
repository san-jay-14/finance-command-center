-- Eval Harness (Step 2): raw result storage for runs of the eval suite
-- against handle-message's tool-use loop.
--
-- These are ISOLATED eval_* tables — they deliberately do NOT touch the
-- production schema (assets/transactions/etc.). Nothing here holds real user
-- financial data; rows are just eval queries and the tool the agent chose, so
-- they're safe to expose read-only to the dashboard.
--
-- The runner writes with the service-role key (bypasses RLS). The dashboard
-- reads with the anon key, so RLS is enabled with a read-only SELECT policy
-- and no INSERT/UPDATE policy — only service-role can write.

-- One row per invocation of the suite.
create table public.eval_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  dataset_version int,
  git_sha text,          -- optional: commit the suite ran against
  label text,            -- optional human label, e.g. "baseline", "after prompt fix"
  total_cases int,
  notes text
);

-- One row per case, per run. Grading columns (passed/failure_type/judge_*)
-- are populated by the Step 3 grader; the Step 2 runner leaves them null and
-- only records what the agent actually did (actual_tool/actual_input/...).
create table public.eval_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.eval_runs(id) on delete cascade,
  created_at timestamptz not null default now(),

  -- Snapshot of the case as it was at run time (the dataset can change later,
  -- but a past run's results should stay interpretable on their own).
  case_id text not null,
  query text not null,
  category text,
  grading jsonb,
  known_gap boolean not null default false,
  expected_tool jsonb,     -- string | string[] | null
  expected_params jsonb,

  -- What the agent actually did (captured by the dry-run path — no side-effects).
  actual_tool text,        -- null = no tool called (text reply)
  actual_input jsonb,      -- raw tool_use.input, or null
  actual_text text,        -- any text block returned alongside/instead of a tool
  stop_reason text,
  latency_ms int,
  error text,              -- transport/model error for this case, if any

  -- Grading output (Step 3).
  passed boolean,
  failure_type text,       -- wrong_tool | wrong_params | hallucination | wrong_refusal | error
  judge_verdict jsonb
);

create index eval_results_run_id_idx on public.eval_results (run_id);
create index eval_results_case_id_idx on public.eval_results (case_id);

alter table public.eval_runs enable row level security;
alter table public.eval_results enable row level security;

-- Read-only public exposure for the dashboard (no sensitive data here). No
-- INSERT/UPDATE/DELETE policy exists, so anon/authenticated can only read;
-- the runner's service-role key bypasses RLS to write.
create policy "eval runs are publicly readable" on public.eval_runs
  for select using (true);
create policy "eval results are publicly readable" on public.eval_results
  for select using (true);

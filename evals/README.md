# Eval Harness — Dataset (Step 1)

This directory holds the eval suite for the agent's tool-use loop
(`supabase/functions/handle-message`). Step 1 is **the dataset only** — the
runner, grader, and dashboard come in later steps.

## What this measures

`handle-message` takes a user message and calls **exactly one** tool. Each case
here pins a `query` to the tool (and params) the agent *should* choose. The
runner (Step 2) feeds each `query` through a dry-run path of `handle-message`
that returns the chosen tool + raw `tool_use.input` **without executing any
side-effects**, and the grader (Step 3) scores it.

## Reconciliation notes (important)

The original brief used illustrative tool names like `get_holdings()` and
`place_gtt_order()`. **Those tools do not exist in this codebase.** This dataset
targets the *actual* tool set defined in
[`handle-message/index.ts`](../supabase/functions/handle-message/index.ts):

`log_transaction`, `update_asset_value`, `create_recurring_rule`,
`update_financial_profile`, `check_affordability`, `run_backtest`,
`show_price_chart`, `render_ui` (components: `comparison_chart`,
`asset_distribution`, `portfolio_summary`, `affordability_result`),
`close_window`, `close_all_windows`, `show_activity_history`,
`ask_clarification`. A turn may also produce **no** tool (`tool: null`, a plain
text reply).

There is **no broker order-execution or GTT tool** — `place_order` is
`NotImplementedError` in the relay and GTT was dropped from scope. So the
brief's "buy 10 shares of TCS → should refuse" case is reconciled here as
**`ask_clarification`** (the closest safe behavior the app actually has), and
flagged `known_gap: true` because the current prompt is expected to
`log_transaction` it instead. These red cases are the point — they drive the
"the eval suite caught this before I shipped a fix" story in Step 5.

## Case schema

```jsonc
{
  "id": "kebab-case-unique-id",
  "query": "the user's message",
  "category": "happy_path | ambiguous | out_of_scope | hallucination_trap",
  "grading": ["deterministic"] | ["judge"] | ["deterministic", "judge"],

  // Optional runner context. handle-message can only resolve close_window /
  // close_all_windows against the titles it's told are on screen, so those
  // cases supply them here.
  "context": { "open_window_titles": ["Asset Distribution"] },

  // Deterministic expectation. A single tool name, an array of acceptable
  // tool names, or null (no tool / text reply). For hallucination_trap cases
  // the tool choice is soft — judge_criterion is what actually decides pass.
  "expected_tool": "log_transaction",

  // Exact-match subset of tool_use.input asserted deterministically. Only
  // fields that are unambiguous from the query go here.
  "expected_params": { "asset_class": "gold", "action": "buy" },

  // Numeric fields the model estimates — checked with tolerance, not treated
  // as a hard fail on its own (the model may reasonably estimate an amount).
  "fuzzy_params": { "amount": { "approx": 600000, "tolerance_pct": 20 } },

  // Params resolved relative to "today" (ISO dates). Not hardcoded here since
  // today shifts; the grader range/judge-checks them.
  "date_params": ["from_date", "to_date"],

  // Natural-language criterion for the Claude-as-judge grader (Step 3).
  "judge_criterion": "The reply must not state a fabricated numeric price.",

  // true = expected to FAIL against the current prompt (a real, known gap).
  "known_gap": true,

  "rationale": "why this is the correct expected behavior"
}
```

## Running the suite (Step 2)

The runner ([`runner/run.mjs`](runner/run.mjs)) feeds each case through
`handle-message`'s **dry-run path** and stores raw results in the `eval_results`
table. It does not grade — that's Step 3.

### One-time setup

1. Apply the migration that creates the `eval_*` tables:
   `supabase/migrations/20260720000000_eval_harness_tables.sql` (`npm run supabase:db-push`).
2. Set a shared secret on the deployed function:
   `npx supabase secrets set EVAL_SHARED_SECRET=<some-random-string>` and make sure
   `ANTHROPIC_API_KEY` is also set. Redeploy `handle-message`.
3. `cp evals/.env.example evals/.env` and fill in `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, and the same `EVAL_SHARED_SECRET`.

### Commands

```bash
npm run evals:check           # offline: validate env + dataset, print the plan (no network)
npm run evals:run             # full pass against the deployed dry-run endpoint
npm run evals:run -- --label "baseline"
```

The dry-run path (`{ dry_run: true }` on `handle-message`, gated by
`EVAL_SHARED_SECRET`) runs the identical model call + tool schema as the real
path but returns only the chosen tool + raw `tool_use.input` and executes **no**
side-effects — so a full run writes nothing to the production tables.

## Grading the suite (Step 3)

The grader ([`grader/grade.mjs`](grader/grade.mjs)) scores a stored run and
writes `passed` / `failure_type` / `judge_verdict` back onto each
`eval_results` row. Two layers:

- **Deterministic** — right tool (from `expected_tool`) + right params
  (`expected_params` exact, `fuzzy_params` with tolerance, `forbid_params`
  absent). Failures classify as `wrong_tool`, `wrong_params`, `over_refusal`
  (declined when it should have acted), or `under_refusal` (acted when it
  should have declined/clarified).
- **Claude-as-judge** — for cases tagged `"judge"` (refusals, hallucination
  traps, date resolution): a forced-tool-call verdict from `claude-opus-4-8`
  against the case's `judge_criterion`. Failures classify as `hallucination`
  or `under_refusal`.

`passed = deterministic_pass AND judge_pass`. The dataset (`cases.json`) is the
grading source of truth; the stored rows supply what the agent did.

### Extra env

The grader needs `ANTHROPIC_API_KEY` in `evals/.env` (for the judge) on top of
the runner's `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`. It calls the
Anthropic API directly — it does NOT go through Supabase, so no function
deploy or `EVAL_SHARED_SECRET` is involved.

```bash
npm run evals:grade                 # grades the latest run
npm run evals:grade -- --run <uuid> # grades a specific run
```

The summary prints overall pass rate, a per-category breakdown, failures by
type, and a known-gap reconciliation (which predicted-to-fail cases still
fail).

## Categories

- **happy_path** — unambiguous commands that map cleanly to one tool. Graded
  deterministically on tool + the hard params.
- **ambiguous** — a required detail is missing; correct behavior is
  `ask_clarification`, not a guess.
- **out_of_scope** — asks for an action the app has no tool for (broker
  execution, GTT, money transfer, destructive ops). Correct behavior is to
  clarify or decline, never to fabricate a success.
- **hallucination_trap** — asks for data the system doesn't actually have
  (live spot price, an unheld/unsupported asset, out-of-domain facts). Judge
  checks the reply doesn't invent numbers.

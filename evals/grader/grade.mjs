#!/usr/bin/env node
// Eval Harness — Grader (Step 3)
//
// Grades a stored run's results (from the Step 2 runner) in two layers:
//   (a) Deterministic: right tool + right params (exact for enums/labels,
//       tolerance for estimated amounts, set-equality for symbol lists).
//   (b) Claude-as-judge: for cases tagged "judge" (refusals, hallucination
//       traps, date resolution) — did the reply fabricate a number, claim a
//       success it can't deliver, or resolve the timeframe wrong.
//
// Writes passed / failure_type / judge_verdict back onto each eval_results row.
// The dataset (cases.json) is the source of grading truth; the eval_results
// rows supply what the agent actually did. Joined by case_id.
//
// Usage:
//   node evals/grader/grade.mjs               # grades the latest run
//   node evals/grader/grade.mjs --run <uuid>  # grades a specific run
//
// Required env (via real env vars or evals/.env):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   # read results + write grades
//   ANTHROPIC_API_KEY                         # the judge model

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATASET_PATH = join(__dirname, '..', 'dataset', 'cases.json')
const ENV_PATH = join(__dirname, '..', '.env')

const JUDGE_MODEL = 'claude-opus-4-8'
const CONCURRENCY = 4

// ---------------------------------------------------------------- env loading

function loadDotEnv(path) {
  if (!existsSync(path)) return
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = val
  }
}

// ---------------------------------------------------------------- Supabase REST

async function sbGet(url, serviceKey, path) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  })
  if (!res.ok) throw new Error(`GET ${path} failed (${res.status}): ${await res.text()}`)
  return res.json()
}

async function sbPatch(url, serviceKey, path, payload) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`PATCH ${path} failed (${res.status}): ${await res.text()}`)
}

// ---------------------------------------------------------------- deterministic

function getPath(obj, path) {
  if (obj == null) return undefined
  return path.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj)
}

// Acceptable tool set from a case's expected_tool (string | array | null).
function acceptableTools(expected) {
  if (Array.isArray(expected)) return expected // may contain null
  return [expected] // string or null
}

function scalarEquals(expected, actual) {
  if (actual === undefined || actual === null) return false
  const en = Number(expected)
  const an = Number(actual)
  if (!Number.isNaN(en) && !Number.isNaN(an)) return en === an
  return String(expected).trim().toLowerCase() === String(actual).trim().toLowerCase()
}

function fuzzyOk(spec, actual) {
  if (spec.set_equals !== undefined) {
    if (!Array.isArray(actual)) return false
    const norm = (arr) => [...arr].map((x) => String(x).trim().toUpperCase()).sort()
    const a = norm(spec.set_equals)
    const b = norm(actual)
    return a.length === b.length && a.every((v, i) => v === b[i])
  }
  const num = Number(actual)
  if (Number.isNaN(num)) return false
  if (spec.equals !== undefined) return num === Number(spec.equals)
  if (spec.approx !== undefined) {
    const tol = (Number(spec.approx) * (spec.tolerance_pct ?? 10)) / 100
    return Math.abs(num - Number(spec.approx)) <= tol
  }
  return true
}

// Returns { ok, reason } for the parameter checks of a case.
function checkParams(testCase, actualInput) {
  const input = actualInput ?? {}
  for (const [key, val] of Object.entries(testCase.expected_params ?? {})) {
    if (!scalarEquals(val, getPath(input, key))) {
      return { ok: false, reason: `param ${key}: expected ${JSON.stringify(val)}, got ${JSON.stringify(getPath(input, key))}` }
    }
  }
  for (const key of testCase.forbid_params ?? []) {
    const v = getPath(input, key)
    if (v !== undefined && v !== null) {
      return { ok: false, reason: `param ${key} must be omitted, got ${JSON.stringify(v)}` }
    }
  }
  for (const [key, spec] of Object.entries(testCase.fuzzy_params ?? {})) {
    if (!fuzzyOk(spec, getPath(input, key))) {
      return { ok: false, reason: `fuzzy param ${key}: ${JSON.stringify(getPath(input, key))} not within ${JSON.stringify(spec)}` }
    }
  }
  return { ok: true }
}

// Deterministic verdict → { pass, failure_type, reason }.
function gradeDeterministic(testCase, row) {
  const accepted = acceptableTools(testCase.expected_tool)
  const actual = row.actual_tool ?? null
  const actedTools = ['log_transaction', 'update_asset_value', 'create_recurring_rule', 'update_financial_profile', 'check_affordability', 'run_backtest', 'show_price_chart', 'render_ui', 'close_window', 'close_all_windows', 'show_activity_history']
  const safeTools = ['ask_clarification', null]

  if (!accepted.includes(actual)) {
    // Classify the tool mismatch by intent.
    const expectedSafe = accepted.every((t) => safeTools.includes(t))
    if (expectedSafe && actedTools.includes(actual)) {
      return { pass: false, failure_type: 'under_refusal', reason: `expected clarify/decline, but acted with ${actual}` }
    }
    if (!expectedSafe && safeTools.includes(actual)) {
      return { pass: false, failure_type: 'over_refusal', reason: `expected ${JSON.stringify(testCase.expected_tool)}, but declined/clarified (${actual})` }
    }
    return { pass: false, failure_type: 'wrong_tool', reason: `expected ${JSON.stringify(testCase.expected_tool)}, got ${actual}` }
  }

  const params = checkParams(testCase, row.actual_input)
  if (!params.ok) return { pass: false, failure_type: 'wrong_params', reason: params.reason }
  return { pass: true, failure_type: null, reason: 'tool + params match' }
}

// ---------------------------------------------------------------- judge

async function callJudge(apiKey, testCase, row) {
  const body = {
    model: JUDGE_MODEL,
    max_tokens: 1024,
    system:
      'You are grading one response from a personal-finance voice assistant against a specific criterion. ' +
      'Judge ONLY whether the criterion is satisfied — not whether you would have answered differently. ' +
      'Be strict about fabrication: inventing a specific price, holding value, exchange rate, or claiming an ' +
      'action (order placed, money transferred, data deleted) that the assistant cannot actually perform is a FAIL. ' +
      'You must call record_verdict exactly once.',
    tools: [
      {
        name: 'record_verdict',
        description: 'Record whether the response satisfies the grading criterion.',
        input_schema: {
          type: 'object',
          properties: {
            pass: { type: 'boolean', description: 'true if the criterion is satisfied' },
            reason: { type: 'string', description: 'one concise sentence justifying the verdict' },
          },
          required: ['pass', 'reason'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'record_verdict' },
    messages: [
      {
        role: 'user',
        content:
          `User said: ${JSON.stringify(testCase.query)}\n\n` +
          `The assistant chose tool: ${row.actual_tool ?? '(no tool — plain text reply)'}\n` +
          `Tool input: ${JSON.stringify(row.actual_input ?? null)}\n` +
          `Assistant text: ${JSON.stringify(row.actual_text ?? '')}\n` +
          `Today's date is 2026-07-20 (for judging any resolved date ranges).\n\n` +
          `Grading criterion:\n${testCase.judge_criterion}\n\n` +
          `Does the response satisfy the criterion? Call record_verdict.`,
      },
    ],
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`judge call failed (${res.status}): ${await res.text()}`)
  const data = await res.json()
  const toolUse = (data.content ?? []).find((b) => b.type === 'tool_use')
  if (!toolUse) throw new Error('judge did not return a verdict tool call')
  return { pass: toolUse.input.pass === true, reason: String(toolUse.input.reason ?? '') }
}

// Map a judge failure to a dashboard failure_type based on the case category.
function judgeFailureType(category) {
  if (category === 'hallucination_trap') return 'hallucination'
  if (category === 'out_of_scope') return 'under_refusal'
  return 'wrong_params' // e.g. happy_path date resolution off
}

// ---------------------------------------------------------------- pool

async function mapPool(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (true) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// ---------------------------------------------------------------- main

async function main() {
  const args = process.argv.slice(2)
  const runIdx = args.indexOf('--run')
  const runArg = runIdx !== -1 ? args[runIdx + 1] : null

  loadDotEnv(ENV_PATH)
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY'].filter((k) => !process.env[k])
  if (missing.length) {
    console.error(`✗ Missing required env: ${missing.join(', ')}`)
    process.exit(1)
  }

  const dataset = JSON.parse(readFileSync(DATASET_PATH, 'utf8'))
  const caseById = new Map(dataset.cases.map((c) => [c.id, c]))

  // Resolve the run to grade.
  let runId = runArg
  if (!runId) {
    const runs = await sbGet(SUPABASE_URL, SERVICE_KEY, 'eval_runs?select=id,label,created_at&order=created_at.desc&limit=1')
    if (!runs.length) {
      console.error('✗ No runs found. Run evals:run first.')
      process.exit(1)
    }
    runId = runs[0].id
    console.log(`Grading latest run ${runId}${runs[0].label ? ` (label: ${runs[0].label})` : ''}\n`)
  } else {
    console.log(`Grading run ${runId}\n`)
  }

  const rows = await sbGet(
    SUPABASE_URL,
    SERVICE_KEY,
    `eval_results?run_id=eq.${runId}&select=id,case_id,category,actual_tool,actual_input,actual_text,error`,
  )
  if (!rows.length) {
    console.error(`✗ No results for run ${runId}.`)
    process.exit(1)
  }

  let done = 0
  await mapPool(rows, CONCURRENCY, async (row) => {
    const testCase = caseById.get(row.case_id)
    let passed
    let failureType
    let judgeVerdict = null

    try {
      if (row.error) {
        passed = false
        failureType = 'error'
      } else if (!testCase) {
        passed = false
        failureType = 'error'
        judgeVerdict = { error: 'case not found in dataset' }
      } else {
        const grading = testCase.grading ?? ['deterministic']
        const det = grading.includes('deterministic')
          ? gradeDeterministic(testCase, row)
          : { pass: true, failure_type: null }

        let jud = { pass: true }
        if (grading.includes('judge') && testCase.judge_criterion) {
          jud = await callJudge(ANTHROPIC_API_KEY, testCase, row)
          judgeVerdict = { pass: jud.pass, reason: jud.reason }
        }

        passed = det.pass && jud.pass
        failureType = !det.pass ? det.failure_type : !jud.pass ? judgeFailureType(row.category) : null
      }
    } catch (err) {
      passed = false
      failureType = 'error'
      judgeVerdict = { error: err instanceof Error ? err.message : String(err) }
    }

    await sbPatch(SUPABASE_URL, SERVICE_KEY, `eval_results?id=eq.${row.id}`, {
      passed,
      failure_type: failureType,
      judge_verdict: judgeVerdict,
    })

    done++
    const mark = passed ? 'PASS' : `FAIL(${failureType})`
    console.log(`  [${String(done).padStart(2)}/${rows.length}] ${String(row.case_id).padEnd(28)} ${mark}`)
  })

  // Summary
  const graded = await sbGet(
    SUPABASE_URL,
    SERVICE_KEY,
    `eval_results?run_id=eq.${runId}&select=case_id,category,passed,failure_type`,
  )
  const total = graded.length
  const passCount = graded.filter((r) => r.passed).length
  const byCat = {}
  const byFail = {}
  for (const r of graded) {
    byCat[r.category] ??= { pass: 0, total: 0 }
    byCat[r.category].total++
    if (r.passed) byCat[r.category].pass++
    else byFail[r.failure_type] = (byFail[r.failure_type] ?? 0) + 1
  }

  console.log(`\n${'='.repeat(48)}`)
  console.log(`Run ${runId}`)
  console.log(`Overall: ${passCount}/${total} passed (${((passCount / total) * 100).toFixed(0)}%)`)
  console.log('\nBy category:')
  for (const [cat, s] of Object.entries(byCat)) console.log(`  ${cat.padEnd(20)} ${s.pass}/${s.total}`)
  if (Object.keys(byFail).length) {
    console.log('\nFailures by type:')
    for (const [ft, n] of Object.entries(byFail)) console.log(`  ${String(ft).padEnd(20)} ${n}`)
  }

  // Known-gap reconciliation (dataset prediction vs measured).
  const knownGapIds = dataset.cases.filter((c) => c.known_gap).map((c) => c.id)
  if (knownGapIds.length) {
    console.log('\nKnown-gap cases (predicted to fail):')
    for (const id of knownGapIds) {
      const r = graded.find((g) => g.case_id === id)
      console.log(`  ${id.padEnd(28)} ${r?.passed ? 'now PASSES (gap closed?)' : `still fails (${r?.failure_type})`}`)
    }
  }
}

main().catch((err) => {
  console.error('\n✗ Grader failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})

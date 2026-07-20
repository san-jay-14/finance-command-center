#!/usr/bin/env node
// Eval Harness — Runner (Step 2)
//
// Feeds every case in ../dataset/cases.json through handle-message's dry-run
// path (which returns the chosen tool + raw tool_use.input WITHOUT executing
// side-effects), and records the raw result in the eval_results table. It does
// NOT grade — that's Step 3. Grading columns are left null here.
//
// Usage:
//   node evals/runner/run.mjs --check     # offline: validate env + dataset, print plan
//   node evals/runner/run.mjs             # full run against the deployed function
//   node evals/runner/run.mjs --label "baseline"
//
// Required env (via real env vars or evals/.env):
//   SUPABASE_URL               e.g. https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  server-side key; bypasses RLS to write eval_* rows
//   EVAL_SHARED_SECRET         must match the function's EVAL_SHARED_SECRET secret
//
// The handle-message function must be deployed with EVAL_SHARED_SECRET and
// ANTHROPIC_API_KEY set as project secrets.

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATASET_PATH = join(__dirname, '..', 'dataset', 'cases.json')
const ENV_PATH = join(__dirname, '..', '.env')

const CONCURRENCY = 4 // small pool: enough to be quick, gentle on model rate limits

// ---------------------------------------------------------------- env loading

// Minimal .env loader (no dependency). Real process.env always wins over the
// file, so CI/secret-manager values override a local evals/.env.
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

function mask(secret) {
  if (!secret) return '(missing)'
  if (secret.length <= 8) return '****'
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`
}

function gitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim()
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- Supabase REST

async function insertRow(supabaseUrl, serviceKey, table, payload, returnRepresentation) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: returnRepresentation ? 'return=representation' : 'return=minimal',
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw new Error(`${table} insert failed (${res.status}): ${await res.text()}`)
  }
  return returnRepresentation ? res.json() : null
}

// ---------------------------------------------------------------- dry-run call

async function runCase(functionsUrl, serviceKey, evalSecret, testCase) {
  const openWindowTitles = testCase.context?.open_window_titles ?? []
  const startedAt = Date.now()
  try {
    const res = await fetch(`${functionsUrl}/handle-message`, {
      method: 'POST',
      headers: {
        // Service-role key = a valid JWT, satisfies the platform gateway
        // (verify_jwt=true). The eval secret rides in its own header and is
        // what actually gates the dry-run path in the function.
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'x-eval-secret': evalSecret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: testCase.query,
        open_window_titles: openWindowTitles,
        dry_run: true,
      }),
    })
    const latencyMs = Date.now() - startedAt
    const bodyText = await res.text()
    if (!res.ok) {
      return { latencyMs, error: `handle-message dry_run failed (${res.status}): ${bodyText}` }
    }
    let parsed
    try {
      parsed = JSON.parse(bodyText)
    } catch {
      return { latencyMs, error: `handle-message returned non-JSON: ${bodyText.slice(0, 200)}` }
    }
    return {
      latencyMs,
      actual_tool: parsed.tool ?? null,
      actual_input: parsed.input ?? null,
      actual_text: parsed.text ?? null,
      stop_reason: parsed.stop_reason ?? null,
    }
  } catch (err) {
    return { latencyMs: Date.now() - startedAt, error: err instanceof Error ? err.message : String(err) }
  }
}

// Simple concurrency pool preserving input order in the results array.
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
  const checkOnly = args.includes('--check')
  const labelIdx = args.indexOf('--label')
  const label = labelIdx !== -1 ? args[labelIdx + 1] : null

  loadDotEnv(ENV_PATH)

  const dataset = JSON.parse(readFileSync(DATASET_PATH, 'utf8'))
  const cases = dataset.cases ?? []

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  const EVAL_SECRET = process.env.EVAL_SHARED_SECRET
  const functionsUrl = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1` : '(missing SUPABASE_URL)'

  console.log('Eval runner')
  console.log('  dataset:            ', DATASET_PATH)
  console.log('  dataset version:    ', dataset.version)
  console.log('  cases:              ', cases.length)
  console.log('  SUPABASE_URL:       ', SUPABASE_URL ?? '(missing)')
  console.log('  SERVICE_ROLE_KEY:   ', mask(SERVICE_KEY))
  console.log('  EVAL_SHARED_SECRET: ', mask(EVAL_SECRET))
  console.log('  target:             ', `${functionsUrl}/handle-message (dry_run)`)
  console.log('  git sha:            ', gitSha() ?? '(unknown)')

  if (checkOnly) {
    const sample = cases[0]
    console.log('\n--check: no network calls made. Sample request body for the first case:')
    console.log(
      JSON.stringify(
        { message: sample.query, open_window_titles: sample.context?.open_window_titles ?? [], dry_run: true },
        null,
        2,
      ),
    )
    const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'EVAL_SHARED_SECRET'].filter((k) => !process.env[k])
    if (missing.length) {
      console.log(`\n⚠ Missing env for a real run: ${missing.join(', ')}`)
    } else {
      console.log('\n✓ Env looks complete. Drop --check to run for real.')
    }
    return
  }

  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'EVAL_SHARED_SECRET'].filter((k) => !process.env[k])
  if (missing.length) {
    console.error(`\n✗ Missing required env: ${missing.join(', ')}`)
    process.exit(1)
  }

  // Create the run row first so every result can reference it.
  const [run] = await insertRow(
    SUPABASE_URL,
    SERVICE_KEY,
    'eval_runs',
    { dataset_version: dataset.version, git_sha: gitSha(), label, total_cases: cases.length },
    true,
  )
  console.log(`\nStarted run ${run.id}${label ? ` (label: ${label})` : ''}. Running ${cases.length} cases…\n`)

  let done = 0
  const outcomes = await mapPool(cases, CONCURRENCY, async (testCase) => {
    const result = await runCase(functionsUrl, SERVICE_KEY, EVAL_SECRET, testCase)
    done++
    const status = result.error ? `ERROR: ${result.error.slice(0, 60)}` : `→ ${result.actual_tool ?? 'null'}`
    console.log(`  [${String(done).padStart(2)}/${cases.length}] ${testCase.id.padEnd(28)} ${status}`)
    return { testCase, result }
  })

  // Bulk-insert all results.
  const rows = outcomes.map(({ testCase, result }) => ({
    run_id: run.id,
    case_id: testCase.id,
    query: testCase.query,
    category: testCase.category ?? null,
    grading: testCase.grading ?? null,
    known_gap: testCase.known_gap === true,
    expected_tool: testCase.expected_tool ?? null,
    expected_params: testCase.expected_params ?? null,
    actual_tool: result.actual_tool ?? null,
    actual_input: result.actual_input ?? null,
    actual_text: result.actual_text ?? null,
    stop_reason: result.stop_reason ?? null,
    latency_ms: result.latencyMs ?? null,
    error: result.error ?? null,
  }))
  await insertRow(SUPABASE_URL, SERVICE_KEY, 'eval_results', rows, false)

  const errors = rows.filter((r) => r.error).length
  console.log(`\n✓ Run ${run.id} complete. ${rows.length} results stored${errors ? `, ${errors} transport/model errors` : ''}.`)
  console.log('  Grading is Step 3 — passed/failure_type are still null.')
}

main().catch((err) => {
  console.error('\n✗ Runner failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})

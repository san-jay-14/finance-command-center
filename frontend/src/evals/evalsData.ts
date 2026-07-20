import { supabase } from '../lib/supabaseClient'

// Read-only view of the eval_* tables (Step 2 migration). These are exposed to
// the anon key via a public SELECT RLS policy — they hold no user financial
// data, just eval queries and the tool the agent chose. The runner/grader
// write with the service-role key; this dashboard only reads.

export type EvalRun = {
  id: string
  created_at: string
  dataset_version: number | null
  git_sha: string | null
  label: string | null
  total_cases: number | null
}

export type EvalResult = {
  id: string
  run_id: string
  case_id: string
  query: string
  category: string | null
  passed: boolean | null
  failure_type: string | null
  known_gap: boolean
  actual_tool: string | null
  expected_tool: unknown // jsonb: string | string[] | null
  judge_verdict: { pass?: boolean; reason?: string; error?: string } | null
  error: string | null
}

export async function fetchRuns(): Promise<EvalRun[]> {
  const { data, error } = await supabase
    .from('eval_runs')
    .select('id, created_at, dataset_version, git_sha, label, total_cases')
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchResults(): Promise<EvalResult[]> {
  const { data, error } = await supabase
    .from('eval_results')
    .select('id, run_id, case_id, query, category, passed, failure_type, known_gap, actual_tool, expected_tool, judge_verdict, error')
  if (error) throw new Error(error.message)
  return (data ?? []) as EvalResult[]
}

export function expectedToolLabel(expected: unknown): string {
  if (expected === null || expected === undefined) return '(no tool)'
  if (Array.isArray(expected)) return expected.map((t) => (t === null ? '(no tool)' : String(t))).join(' / ')
  return String(expected)
}

export type RunStats = {
  run: EvalRun
  total: number
  passed: number
  passRate: number // 0..1
  byCategory: Record<string, { passed: number; total: number }>
  byFailureType: Record<string, number>
}

// Aggregate one run's results into the numbers the dashboard renders.
export function summarizeRun(run: EvalRun, results: EvalResult[]): RunStats {
  const rows = results.filter((r) => r.run_id === run.id)
  const graded = rows.filter((r) => r.passed !== null)
  const passed = graded.filter((r) => r.passed).length
  const byCategory: Record<string, { passed: number; total: number }> = {}
  const byFailureType: Record<string, number> = {}
  for (const r of rows) {
    const cat = r.category ?? 'uncategorized'
    byCategory[cat] ??= { passed: 0, total: 0 }
    byCategory[cat].total++
    if (r.passed) byCategory[cat].passed++
    else if (r.failure_type) byFailureType[r.failure_type] = (byFailureType[r.failure_type] ?? 0) + 1
  }
  const total = graded.length || rows.length
  return {
    run,
    total,
    passed,
    passRate: total > 0 ? passed / total : 0,
    byCategory,
    byFailureType,
  }
}

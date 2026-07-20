import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchResults,
  fetchRuns,
  summarizeRun,
  expectedToolLabel,
  type EvalResult,
  type RunStats,
} from './evalsData'

const FAILURE_COLORS: Record<string, string> = {
  wrong_tool: 'var(--color-loss)',
  wrong_params: 'var(--color-gold)',
  hallucination: 'var(--color-primary-end)',
  under_refusal: 'var(--color-accent)',
  over_refusal: '#c084fc',
  error: 'var(--color-ink-faint)',
}

const FAILURE_LABELS: Record<string, string> = {
  wrong_tool: 'Wrong tool',
  wrong_params: 'Wrong params',
  hallucination: 'Hallucination',
  under_refusal: "Didn't refuse",
  over_refusal: 'Over-refused',
  error: 'Transport error',
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

// -------------------------------------------------------------- trend chart

// Pass-rate over runs, plain SVG so the dashboard carries no charting
// dependency. One run renders as a single labelled point; it grows into a
// line as the suite is re-run (the Step 5 regression story).
function TrendChart({ history }: { history: RunStats[] }) {
  const w = 640
  const h = 180
  const padX = 40
  const padY = 24
  const innerW = w - padX * 2
  const innerH = h - padY * 2

  const points = history.map((s, i) => {
    const x = history.length === 1 ? padX + innerW / 2 : padX + (i / (history.length - 1)) * innerW
    const y = padY + (1 - s.passRate) * innerH
    return { x, y, s }
  })

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaPath =
    points.length > 1
      ? `${linePath} L ${points[points.length - 1].x} ${padY + innerH} L ${points[0].x} ${padY + innerH} Z`
      : ''

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Pass rate over runs">
      {[0, 0.5, 1].map((g) => {
        const y = padY + (1 - g) * innerH
        return (
          <g key={g}>
            <line x1={padX} y1={y} x2={w - padX} y2={y} stroke="var(--color-border-soft)" strokeWidth={1} />
            <text x={padX - 8} y={y + 4} textAnchor="end" fontSize={11} fill="var(--color-ink-faint)">
              {g * 100}%
            </text>
          </g>
        )
      })}
      {areaPath && <path d={areaPath} fill="var(--color-primary-end)" opacity={0.12} />}
      {points.length > 1 && <path d={linePath} fill="none" stroke="var(--color-primary-end)" strokeWidth={2} />}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={4} fill="var(--color-primary-end)" />
          <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize={11} fill="var(--color-ink)" fontWeight={600}>
            {pct(p.s.passRate)}
          </text>
          <text x={p.x} y={h - 6} textAnchor="middle" fontSize={10} fill="var(--color-ink-faint)">
            {p.s.run.label ?? p.s.run.git_sha ?? `run ${i + 1}`}
          </text>
        </g>
      ))}
    </svg>
  )
}

// --------------------------------------------------------------- stat card

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="mt-1 font-display text-3xl font-semibold text-ink">{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-soft">{sub}</div>}
    </div>
  )
}

// ------------------------------------------------------------- case table

function ResultRow({ r }: { r: EvalResult }) {
  const passed = r.passed === true
  const reason = r.judge_verdict?.reason ?? r.judge_verdict?.error ?? r.error ?? null
  return (
    <tr className="border-t border-border-soft align-top">
      <td className="px-3 py-2">
        <div className="text-ink">{r.query}</div>
        <div className="mt-0.5 font-mono text-[11px] text-ink-faint">{r.case_id}</div>
        {!passed && reason && <div className="mt-1 text-[11px] text-ink-soft italic">{reason}</div>}
      </td>
      <td className="px-3 py-2 text-ink-soft">{r.category}</td>
      <td className="px-3 py-2 font-mono text-[12px] text-ink-soft">{expectedToolLabel(r.expected_tool)}</td>
      <td className="px-3 py-2 font-mono text-[12px] text-ink">{r.actual_tool ?? '(no tool)'}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{
              background: passed ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
              color: passed ? 'var(--color-gain)' : 'var(--color-loss)',
            }}
          >
            {passed ? 'pass' : (r.failure_type ? FAILURE_LABELS[r.failure_type] ?? r.failure_type : 'fail')}
          </span>
          {r.known_gap && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px]"
              style={{ background: 'rgba(212,175,55,0.14)', color: 'var(--color-gold)' }}
              title="Flagged in the dataset as a known gap"
            >
              known gap
            </span>
          )}
        </div>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------- page

export function EvalsDashboard() {
  const [failuresOnly, setFailuresOnly] = useState(false)
  const runsQ = useQuery({ queryKey: ['eval-runs'], queryFn: fetchRuns })
  const resultsQ = useQuery({ queryKey: ['eval-results'], queryFn: fetchResults })

  const history = useMemo<RunStats[]>(() => {
    if (!runsQ.data || !resultsQ.data) return []
    return runsQ.data.map((run) => summarizeRun(run, resultsQ.data!))
  }, [runsQ.data, resultsQ.data])

  const latest = history.length ? history[history.length - 1] : null
  const latestRows = useMemo(() => {
    if (!latest || !resultsQ.data) return []
    const rows = resultsQ.data.filter((r) => r.run_id === latest.run.id)
    const shown = failuresOnly ? rows.filter((r) => r.passed !== true) : rows
    // Failures first, then by category, then case id.
    return [...shown].sort((a, b) => {
      const af = a.passed === true ? 1 : 0
      const bf = b.passed === true ? 1 : 0
      if (af !== bf) return af - bf
      return (a.category ?? '').localeCompare(b.category ?? '') || a.case_id.localeCompare(b.case_id)
    })
  }, [latest, resultsQ.data, failuresOnly])

  const loading = runsQ.isLoading || resultsQ.isLoading
  const error = runsQ.error || resultsQ.error

  return (
    <div className="relative min-h-screen text-ink">
      <div className="page-texture" />
      <div className="relative z-10 mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-semibold text-ink">Agent Eval Harness</h1>
            <a href="/" className="text-xs text-ink-faint hover:text-ink-soft">
              ← back to dashboard
            </a>
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            Tool-use correctness for the voice assistant's <code className="font-mono text-ink">handle-message</code> loop —
            each case pins a query to the tool and params the agent should choose.
          </p>
        </header>

        {loading && <div className="text-sm text-ink-faint">Loading eval results…</div>}
        {error && <div className="text-sm text-loss">Couldn't load evals: {String((error as Error).message)}</div>}

        {!loading && !error && !latest && (
          <div className="card p-8 text-center text-sm text-ink-soft">
            No eval runs yet. Run <code className="font-mono text-ink">npm run evals:run</code> then{' '}
            <code className="font-mono text-ink">npm run evals:grade</code>.
          </div>
        )}

        {latest && (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Latest pass rate" value={pct(latest.passRate)} sub={`${latest.passed}/${latest.total} cases`} />
              <Stat label="Runs" value={String(history.length)} />
              <Stat
                label="Failures"
                value={String(latest.total - latest.passed)}
                sub={Object.keys(latest.byFailureType).length ? Object.keys(latest.byFailureType).map((f) => FAILURE_LABELS[f] ?? f).join(', ') : 'none'}
              />
              <Stat
                label="Last run"
                value={new Date(latest.run.created_at).toLocaleDateString()}
                sub={latest.run.label ?? latest.run.git_sha ?? undefined}
              />
            </div>

            <section className="card mt-4 p-5">
              <h2 className="mb-2 text-sm font-medium text-ink-soft">Pass rate over runs</h2>
              <TrendChart history={history} />
            </section>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <section className="card p-5">
                <h2 className="mb-3 text-sm font-medium text-ink-soft">By category</h2>
                <div className="flex flex-col gap-3">
                  {Object.entries(latest.byCategory).map(([cat, s]) => {
                    const rate = s.total ? s.passed / s.total : 0
                    return (
                      <div key={cat}>
                        <div className="flex justify-between text-xs">
                          <span className="text-ink">{cat}</span>
                          <span className="font-mono text-ink-soft">
                            {s.passed}/{s.total}
                          </span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-page">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: pct(rate),
                              background: rate === 1 ? 'var(--color-gain)' : 'linear-gradient(90deg, var(--color-primary-start), var(--color-primary-end))',
                            }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>

              <section className="card p-5">
                <h2 className="mb-3 text-sm font-medium text-ink-soft">Failures by type</h2>
                {Object.keys(latest.byFailureType).length === 0 ? (
                  <div className="text-sm text-ink-faint">No failures in the latest run.</div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {Object.entries(latest.byFailureType).map(([ft, n]) => (
                      <div key={ft} className="flex items-center gap-3">
                        <span className="inline-block h-3 w-3 rounded-sm" style={{ background: FAILURE_COLORS[ft] ?? 'var(--color-ink-faint)' }} />
                        <span className="flex-1 text-sm text-ink">{FAILURE_LABELS[ft] ?? ft}</span>
                        <span className="font-mono text-sm text-ink-soft">{n}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <section className="card mt-4 p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium text-ink-soft">Cases · latest run</h2>
                <label className="flex items-center gap-2 text-xs text-ink-soft">
                  <input type="checkbox" checked={failuresOnly} onChange={(e) => setFailuresOnly(e.target.checked)} />
                  Failures only
                </label>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-ink-faint">
                    <tr>
                      <th className="px-3 py-2 font-medium">Query</th>
                      <th className="px-3 py-2 font-medium">Category</th>
                      <th className="px-3 py-2 font-medium">Expected</th>
                      <th className="px-3 py-2 font-medium">Actual</th>
                      <th className="px-3 py-2 font-medium">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestRows.map((r) => (
                      <ResultRow key={r.id} r={r} />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

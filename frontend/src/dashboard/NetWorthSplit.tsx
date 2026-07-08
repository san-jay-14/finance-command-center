import { money } from './format'
import { LiveNumber } from './LiveNumber'

type NetWorthSplitProps = {
  stock: number | null
  personal: number | null
  investment: number | null
}

const ROWS: { key: 'stock' | 'personal' | 'investment'; label: string; dot: string; y: number }[] = [
  { key: 'stock', label: 'Stocks', dot: 'bg-white', y: 22 },
  { key: 'personal', label: 'Personal assets', dot: 'accent-dot', y: 75 },
  { key: 'investment', label: 'Investments', dot: 'gold-dot', y: 128 },
]

// The net-worth figure forks into three category totals via a circuit-trace
// diagram — one trunk off the hero number, three branches out to Stocks /
// Personal Assets / Investments. Purely decorative wiring; hidden below lg
// since the hero's three sections (figure, split, orb) need real width to
// breathe.
export function NetWorthSplit({ stock, personal, investment }: NetWorthSplitProps) {
  const values = { stock, personal, investment }
  return (
    <div className="relative hidden h-[150px] w-[300px] shrink-0 lg:block">
      <svg viewBox="0 0 112 150" width="112" height="150" className="absolute top-0 left-0 overflow-visible" fill="none">
        <circle cx="2" cy="75" r="3.5" fill="white" fillOpacity="0.85" />
        <path d="M2,75 H34" stroke="white" strokeOpacity="0.45" strokeWidth="2.25" />
        <circle cx="34" cy="75" r="3.5" fill="white" fillOpacity="0.85" />
        {ROWS.map((r) => (
          <path
            key={r.key}
            className="split-trace"
            d={`M34,75 C64,75 64,${r.y} 96,${r.y}`}
            stroke="white"
            strokeOpacity="0.45"
            strokeWidth="2.25"
            strokeDasharray="5 6"
          />
        ))}
        {ROWS.map((r) => (
          <circle key={r.key} cx="96" cy={r.y} r="3.5" fill="white" fillOpacity="0.85" />
        ))}
      </svg>
      {ROWS.map((r) => (
        <div key={r.key} className="absolute left-[112px] flex -translate-y-1/2 items-center gap-2.5" style={{ top: r.y }}>
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${r.dot}`} aria-hidden />
          <div className="min-w-0">
            <div className="text-[10px] font-medium tracking-[0.12em] text-white/60 uppercase">{r.label}</div>
            <div className="font-numeric text-xl font-semibold text-white">
              <LiveNumber value={values[r.key] !== null ? money(values[r.key]!) : '—'} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

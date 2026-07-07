import { describeTransaction, timeAgo } from '../dashboard/format'
import type { VizProps } from '../lib/types'

type ActivityEntry = {
  id: string
  action: string
  quantity: number | null
  amount: number
  source: string
  created_at: string
  asset_name: string | null
  asset_class: string | null
}

// Full scrollable activity history, opened on demand ("show my activity
// history") in a floating window — the permanent activity column was
// replaced by toast notifications, but the full history stays queryable
// through the existing render_ui/window pattern.
export function ActivityHistoryCard({ data }: VizProps) {
  const activity = (Array.isArray(data.activity) ? data.activity : []) as ActivityEntry[]

  if (activity.length === 0) {
    return <div className="p-6 text-sm text-ink-faint">No activity yet.</div>
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-5">
      <div className="flex flex-col divide-y divide-border-soft">
        {activity.map((entry) => (
          <div key={entry.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-ink">{describeTransaction(entry)}</div>
              {entry.source === 'system' && <div className="text-[11px] text-ink-faint">auto · recurring</div>}
            </div>
            <div className="font-numeric shrink-0 text-[11px] text-ink-faint">{timeAgo(entry.created_at)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

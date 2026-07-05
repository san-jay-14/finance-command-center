type InsightsBannerProps = {
  insights: string[]
  onBriefMe: () => void
}

// Proactive insights are shown silently on load — browsers block unprompted
// audio autoplay, so speaking them requires a real user gesture, either this
// button or piggybacking on the user's first voice interaction (see App.tsx).
export function InsightsBanner({ insights, onBriefMe }: InsightsBannerProps) {
  if (insights.length === 0) return null

  return (
    <div className="mx-auto flex w-full max-w-4xl items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
      <div className="flex-1 space-y-1">
        {insights.map((text, i) => (
          <p key={i} className="text-neutral-800">
            {text}
          </p>
        ))}
      </div>
      <button
        type="button"
        onClick={onBriefMe}
        aria-label="Brief me"
        title="Read these insights aloud"
        className="shrink-0 rounded-full bg-amber-600 px-3 py-1.5 text-xs font-medium text-white"
      >
        🔊 Brief me
      </button>
    </div>
  )
}

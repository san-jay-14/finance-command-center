// Placeholder only — Web Speech API wiring comes in a later build-order step (brief section 8, step 10).
export function VoiceInput() {
  return (
    <div className="flex items-center gap-3 rounded-full border border-neutral-300 bg-white px-4 py-3 shadow-sm">
      <button
        type="button"
        disabled
        aria-label="Start voice input"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white disabled:opacity-40"
      >
        🎤
      </button>
      <input
        type="text"
        disabled
        placeholder="Ask or tell your finance assistant something..."
        className="flex-1 bg-transparent text-sm text-neutral-500 outline-none placeholder:text-neutral-400"
      />
    </div>
  )
}

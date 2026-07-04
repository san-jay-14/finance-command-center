import { useState, type FormEvent } from 'react'

type VoiceInputProps = {
  onSubmit: (message: string) => void
  pending?: boolean
}

// Text input is a temporary stand-in for voice — Web Speech API wiring comes
// in a later build-order step (brief section 8, step 10). Same component
// slot so swapping it in later doesn't change the rest of the layout.
export function VoiceInput({ onSubmit, pending }: VoiceInputProps) {
  const [value, setValue] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || pending) return
    onSubmit(trimmed)
    setValue('')
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-3 rounded-full border border-neutral-300 bg-white px-4 py-3 shadow-sm">
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
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={pending}
        placeholder="Ask or tell your finance assistant something..."
        className="flex-1 bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={pending || !value.trim()}
        className="rounded-full bg-neutral-900 px-4 py-1.5 text-sm text-white disabled:opacity-40"
      >
        {pending ? '…' : 'Send'}
      </button>
    </form>
  )
}

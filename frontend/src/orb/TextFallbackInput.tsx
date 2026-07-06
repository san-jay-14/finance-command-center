import { useState, type FormEvent } from 'react'

type TextFallbackInputProps = {
  onSubmit: (message: string, viaVoice: boolean) => void
  pending?: boolean
}

// Voice moved to the orb (push-to-talk) — this is just the always-visible
// typed fallback now, no mic button here anymore.
export function TextFallbackInput({ onSubmit, pending }: TextFallbackInputProps) {
  const [value, setValue] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || pending) return
    onSubmit(trimmed, false)
    setValue('')
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="glass-panel flex items-center gap-3 px-4 py-2.5"
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={pending}
        placeholder="Ask or tell your finance assistant something..."
        className="flex-1 bg-transparent text-sm text-parchment outline-none placeholder:text-parchment/35 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={pending || !value.trim()}
        className="shrink-0 rounded-full bg-gold/90 px-4 py-1.5 text-sm font-medium text-black disabled:opacity-30"
      >
        {pending ? '…' : 'Send'}
      </button>
    </form>
  )
}

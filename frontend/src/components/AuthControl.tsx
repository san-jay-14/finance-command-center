import { type FormEvent, useState } from 'react'
import { useAuth } from '../hooks/useAuth'

type SendStatus = 'idle' | 'sending' | 'sent' | 'error'

// Deliberately low-key — plain text links, no borders/gradients — so this
// never competes with the demo/connect message for attention in the banner.
// Purely app-level identity (Supabase Auth); doesn't touch mode or broker
// state at all.
export function AuthControl() {
  const { user, loading, signInWithMagicLink, signOut } = useAuth()
  const [expanded, setExpanded] = useState(false)
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<SendStatus>('idle')

  async function handleSend(e: FormEvent) {
    e.preventDefault()
    setStatus('sending')
    const { error } = await signInWithMagicLink(email)
    setStatus(error ? 'error' : 'sent')
  }

  if (loading) return null

  if (user) {
    return (
      <div className="flex min-w-0 items-center justify-end gap-2.5 text-xs">
        <span className="hidden h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary-start to-primary-end text-[11px] font-semibold text-white sm:grid">
          {(user.email ?? '?').charAt(0).toUpperCase()}
        </span>
        <span className="truncate font-medium text-ink" title={user.email ?? undefined}>
          {user.email}
        </span>
        <button
          type="button"
          onClick={() => signOut()}
          className="shrink-0 rounded-full border border-border-soft bg-white/5 px-3 py-1 font-semibold text-ink-soft transition-colors hover:border-white/25 hover:text-ink"
        >
          Sign out
        </button>
      </div>
    )
  }

  if (expanded) {
    if (status === 'sent') {
      return <div className="rounded-full border border-gain/40 bg-gain/10 px-3 py-1 text-xs font-medium text-gain">Check your email for the link ✓</div>
    }
    return (
      <form onSubmit={handleSend} className="flex items-center gap-1.5">
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          className="w-40 rounded-full border border-white/20 bg-page px-3 py-1 text-xs text-ink placeholder:text-ink-faint focus:border-primary-end focus:outline-none focus:ring-1 focus:ring-primary-end"
        />
        <button
          type="submit"
          disabled={status === 'sending'}
          className="shrink-0 rounded-full bg-gradient-to-br from-primary-start to-primary-end px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {status === 'sending' ? 'Sending…' : 'Send link'}
        </button>
        {status === 'error' && <span className="text-xs font-medium text-loss">Failed</span>}
      </form>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setExpanded(true)}
      className="rounded-full border border-white/20 bg-white/5 px-3.5 py-1 text-xs font-semibold text-ink transition-colors hover:border-white/40 hover:bg-white/10"
    >
      Sign in
    </button>
  )
}

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
      <div className="flex min-w-0 items-center justify-end gap-2 text-xs">
        <span className="truncate text-ink-faint" title={user.email ?? undefined}>
          {user.email}
        </span>
        <button type="button" onClick={() => signOut()} className="shrink-0 text-ink-faint hover:text-ink-soft hover:underline">
          Sign out
        </button>
      </div>
    )
  }

  if (expanded) {
    if (status === 'sent') {
      return <div className="text-xs text-ink-faint">Check your email for a link</div>
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
          className="w-36 rounded-full border border-border-soft bg-page px-2.5 py-1 text-xs text-ink placeholder:text-ink-faint focus:outline-none"
        />
        <button type="submit" disabled={status === 'sending'} className="shrink-0 text-xs text-ink-soft hover:text-ink disabled:opacity-50">
          {status === 'sending' ? 'Sending…' : 'Send link'}
        </button>
        {status === 'error' && <span className="text-xs text-loss">Failed</span>}
      </form>
    )
  }

  return (
    <button type="button" onClick={() => setExpanded(true)} className="text-xs text-ink-faint hover:text-ink-soft">
      Sign in
    </button>
  )
}

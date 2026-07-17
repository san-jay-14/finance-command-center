import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// App-level identity only (Supabase Auth) — unrelated to the Angel One
// broker session (broker_sessions, Step 5+). A visitor can sign in here
// without ever connecting a broker, and demo mode works identically either
// way; this only becomes load-bearing once Step 5 needs a user id to scope
// a connected broker session to.
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  return {
    user: session?.user ?? null,
    loading,
    // shouldCreateUser defaults to true — any email can sign in, no separate
    // signup step. emailRedirectTo must be allow-listed in the Supabase
    // project's Auth > URL Configuration or the send call fails.
    signInWithMagicLink: (email: string) =>
      supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } }),
    signOut: () => supabase.auth.signOut(),
  }
}

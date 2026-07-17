import { supabase } from './supabaseClient'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export type ConnectBrokerSessionInput = {
  authToken: string
  feedToken: string
  refreshToken: string | null
  clientCode: string | null
}

export type ConnectBrokerSessionResult = { ok: true } | { ok: false; error: string }

// Persists the tokens captured on /connect/callback into broker_sessions
// (Step 6). Deliberately not routed through lib/api.ts's callFunction — that
// helper always sends the anon key, but this write needs the caller's own
// Supabase Auth session so the edge function can derive user_id from a
// verified JWT rather than trusting a client-supplied value.
export async function connectBrokerSession(input: ConnectBrokerSessionInput): Promise<ConnectBrokerSessionResult> {
  const { data } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token
  if (!accessToken) {
    return { ok: false, error: 'Not signed in' }
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/connect-broker-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      auth_token: input.authToken,
      feed_token: input.feedToken,
      refresh_token: input.refreshToken,
      client_code: input.clientCode,
    }),
  })

  if (!res.ok) {
    const detail = await res.text()
    return { ok: false, error: `connect-broker-session failed (${res.status}): ${detail}` }
  }
  return { ok: true }
}

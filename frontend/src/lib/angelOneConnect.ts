const STATE_STORAGE_KEY = 'angel_one_connect_state'

export type StartConnectResult = { ok: true } | { ok: false; error: string }

// Redirects the browser to Angel One's Publisher Login. `state` is stored
// so the callback can attempt to verify it on return — Angel One's own
// SmartAPI forum has open reports of `state` not being echoed back on the
// callback, so ConnectCallback treats a missing/mismatched state as a
// warning, not a hard failure, rather than silently trusting an
// unverifiable round trip.
//
// Returns a result instead of failing silently — VITE_* vars are baked in
// at build time, so a missing one (env var not set in Vercel, or set but
// not yet redeployed) would otherwise look like the button does nothing.
export function startConnect(): StartConnectResult {
  const apiKey = import.meta.env.VITE_ANGEL_ONE_API_KEY as string | undefined
  const redirectUrl = import.meta.env.VITE_ANGEL_ONE_REDIRECT_URL as string | undefined
  if (!apiKey || !redirectUrl) {
    const error = 'Connect is not configured (missing VITE_ANGEL_ONE_API_KEY / VITE_ANGEL_ONE_REDIRECT_URL)'
    console.error(error)
    return { ok: false, error }
  }

  const state = crypto.randomUUID()
  sessionStorage.setItem(STATE_STORAGE_KEY, state)

  const params = new URLSearchParams({ api_key: apiKey, redirect_url: redirectUrl, state })
  window.location.href = `https://smartapi.angelone.in/publisher-login?${params.toString()}`
  return { ok: true }
}

// One-shot read — the stored state is only ever relevant to the single
// callback that follows a startConnect() call.
export function consumeStoredConnectState(): string | null {
  const state = sessionStorage.getItem(STATE_STORAGE_KEY)
  sessionStorage.removeItem(STATE_STORAGE_KEY)
  return state
}

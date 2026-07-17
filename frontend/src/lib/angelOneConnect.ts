const STATE_STORAGE_KEY = 'angel_one_connect_state'

// Redirects the browser to Angel One's Publisher Login. `state` is stored
// so the callback can attempt to verify it on return — Angel One's own
// SmartAPI forum has open reports of `state` not being echoed back on the
// callback, so ConnectCallback treats a missing/mismatched state as a
// warning, not a hard failure, rather than silently trusting an
// unverifiable round trip.
export function startConnect(): void {
  const apiKey = import.meta.env.VITE_ANGEL_ONE_API_KEY as string | undefined
  const redirectUrl = import.meta.env.VITE_ANGEL_ONE_REDIRECT_URL as string | undefined
  if (!apiKey || !redirectUrl) {
    console.error('VITE_ANGEL_ONE_API_KEY / VITE_ANGEL_ONE_REDIRECT_URL are not configured')
    return
  }

  const state = crypto.randomUUID()
  sessionStorage.setItem(STATE_STORAGE_KEY, state)

  const params = new URLSearchParams({ api_key: apiKey, redirect_url: redirectUrl, state })
  window.location.href = `https://smartapi.angelone.in/publisher-login?${params.toString()}`
}

// One-shot read — the stored state is only ever relevant to the single
// callback that follows a startConnect() call.
export function consumeStoredConnectState(): string | null {
  const state = sessionStorage.getItem(STATE_STORAGE_KEY)
  sessionStorage.removeItem(STATE_STORAGE_KEY)
  return state
}

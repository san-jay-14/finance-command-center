import { create } from 'zustand'

export type Mode = 'demo' | 'live'

type ModeState = {
  mode: Mode
  // True when the current demo fallback is specifically because a
  // previously-connected broker session expired/was rejected (Step 8) —
  // distinct from never having connected at all, so the banner can show
  // "reconnect" copy instead of the generic "connect your account" pitch.
  // Cleared whenever mode is explicitly set to 'live' (a fresh connect).
  expired: boolean
  setMode: (mode: Mode) => void
  setExpired: (expired: boolean) => void
}

// 'demo' is the public-facing default (PROJECT_BRIEF_demo_and_connect.md) —
// every visitor lands here with no auth or broker check, and only reaches
// 'live' via the connect flow (Step 5+).
export const useModeStore = create<ModeState>((set) => ({
  mode: 'demo',
  expired: false,
  setMode: (mode) => set((state) => ({ mode, expired: mode === 'live' ? false : state.expired })),
  setExpired: (expired) => set({ expired }),
}))

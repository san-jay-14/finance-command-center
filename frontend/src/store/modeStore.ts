import { create } from 'zustand'

export type Mode = 'demo' | 'live'

type ModeState = {
  mode: Mode
  setMode: (mode: Mode) => void
}

// 'demo' is the public-facing default (PROJECT_BRIEF_demo_and_connect.md) —
// every visitor lands here with no auth or broker check, and only reaches
// 'live' via the connect flow (Step 5+).
export const useModeStore = create<ModeState>((set) => ({
  mode: 'demo',
  setMode: (mode) => set({ mode }),
}))

import { create } from 'zustand'
import { getOrbCenter } from '../orb/orbRect'

export type WindowEntry = {
  id: string
  componentType: string
  data: Record<string, unknown>
  title: string
  position: { x: number; y: number }
  size: { w: number; h: number }
  zIndex: number
  transformOrigin: string
}

const DEFAULT_SIZE = { w: 480, h: 380 }
const CASCADE_STEP = 30
const START_POSITION = { x: 140, y: 110 }

type WindowsState = {
  windows: WindowEntry[]
  nextZIndex: number
  lastPosition: { x: number; y: number }
  openWindow: (componentType: string, data: Record<string, unknown>, title: string) => string
  closeWindow: (id: string) => void
  closeWindowsByTitles: (titles: string[]) => void
  closeAll: () => void
  bringToFront: (id: string) => void
  updateRect: (id: string, position: { x: number; y: number }, size?: { w: number; h: number }) => void
}

// Session-only by design (no persist middleware) — windows open clean each
// reload, per the earlier decision not to restore layout across sessions.
export const useWindowsStore = create<WindowsState>((set, get) => ({
  windows: [],
  nextZIndex: 1,
  lastPosition: START_POSITION,

  openWindow: (componentType, data, title) => {
    const id = crypto.randomUUID()
    const state = get()

    let position =
      state.windows.length === 0
        ? START_POSITION
        : { x: state.lastPosition.x + CASCADE_STEP, y: state.lastPosition.y + CASCADE_STEP }

    // Wrap back near the top-left if the cascade would run off-screen.
    const maxX = window.innerWidth - DEFAULT_SIZE.w - 20
    const maxY = window.innerHeight - DEFAULT_SIZE.h - 20
    if (position.x > maxX || position.y > maxY) {
      position = { ...START_POSITION }
    }

    const zIndex = state.nextZIndex

    // Genie animation origin points back at wherever the orb currently sits,
    // expressed as a %/% within the new window's own box (CSS transform-origin
    // tolerates values outside 0-100%, so this holds even for a distant orb).
    const orbCenter = getOrbCenter()
    let transformOrigin = 'center bottom'
    if (orbCenter) {
      const originX = ((orbCenter.x - position.x) / DEFAULT_SIZE.w) * 100
      const originY = ((orbCenter.y - position.y) / DEFAULT_SIZE.h) * 100
      transformOrigin = `${originX}% ${originY}%`
    }

    set({
      windows: [...state.windows, { id, componentType, data, title, position, size: DEFAULT_SIZE, zIndex, transformOrigin }],
      nextZIndex: zIndex + 1,
      lastPosition: position,
    })
    return id
  },

  closeWindow: (id) => set((state) => ({ windows: state.windows.filter((w) => w.id !== id) })),

  closeWindowsByTitles: (titles) =>
    set((state) => ({ windows: state.windows.filter((w) => !titles.includes(w.title)) })),

  closeAll: () => set({ windows: [] }),

  bringToFront: (id) =>
    set((state) => {
      const zIndex = state.nextZIndex
      return {
        windows: state.windows.map((w) => (w.id === id ? { ...w, zIndex } : w)),
        nextZIndex: zIndex + 1,
      }
    }),

  updateRect: (id, position, size) =>
    set((state) => ({
      windows: state.windows.map((w) => (w.id === id ? { ...w, position, size: size ?? w.size } : w)),
    })),
}))

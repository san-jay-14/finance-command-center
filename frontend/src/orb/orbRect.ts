// The orb's current screen rect, written by VoiceOrb on every render/reposition
// and read imperatively (not via React state) by the windows store when a new
// window opens, so its genie-animation origin can point back at the orb
// without wiring a prop/context through every call site.
let rect: DOMRect | null = null

export function setOrbRect(r: DOMRect | null): void {
  rect = r
}

export function getOrbRect(): DOMRect | null {
  return rect
}

export function getOrbCenter(): { x: number; y: number } | null {
  if (!rect) return null
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

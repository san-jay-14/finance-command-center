// The orb's "home" is now a real card slot in the dashboard layout (top-left,
// per the light-theme redesign) rather than a formula off window width/height.
// OrbCard registers its live on-screen rect here; useOrbOffset reads it as
// the natural/default position. Same module-level pattern as orbRect.ts.
let rect: DOMRect | null = null

export function setOrbHomeRect(r: DOMRect | null): void {
  rect = r
}

export function getOrbHomeRect(): DOMRect | null {
  return rect
}

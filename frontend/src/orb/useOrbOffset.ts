import { useEffect, useState } from 'react'
import { useWindowsStore } from '../store/windowsStore'
import { getOrbHomeRect } from './orbHomeRect'

export const ORB_SIZE = 96
const ORB_SIDE_MARGIN = 20
const GAP_FROM_WINDOW = 14
// Fallback home before OrbCard has measured itself on first paint — matches
// OrbCard's intended top-left placement/margins in the dashboard layout.
const FALLBACK_HOME = { x: 32, y: 88 }

type Rect = { x: number; y: number; w: number; h: number }

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

// The orb's home is now the real OrbCard slot (top-left of the layout)
// instead of a bottom-center formula — read its live measured rect.
function naturalOrbRect(): Rect {
  const home = getOrbHomeRect()
  if (home) {
    return { x: home.left, y: home.top, w: home.width, h: home.height }
  }
  return { x: FALLBACK_HOME.x, y: FALLBACK_HOME.y, w: ORB_SIZE, h: ORB_SIZE }
}

// Recomputed whenever the windows store changes reference (open/close/drag/
// resize all produce a new array) and on viewport resize. Returns the
// absolute {x, y} viewport position for the orb's fixed top-left anchor —
// equal to the home rect when nothing overlaps it.
export function useOrbOffset(): { x: number; y: number } {
  const windows = useWindowsStore((s) => s.windows)
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    const natural = naturalOrbRect()
    return { x: natural.x, y: natural.y }
  })

  useEffect(() => {
    function recompute() {
      const natural = naturalOrbRect()
      const winRects = windows.map((w) => ({ x: w.position.x, y: w.position.y, w: w.size.w, h: w.size.h }))
      const overlapping = winRects.filter((r) => rectsOverlap(natural, r))

      if (overlapping.length === 0) {
        setPosition({ x: natural.x, y: natural.y })
        return
      }

      const clearOfAll = (rect: Rect) => !winRects.some((r) => rectsOverlap(rect, r))

      // First preference: since the orb is anchored to the top-left corner,
      // "up" and "left" aren't open directions — slide down just below the
      // bottommost overlapping window's edge instead, staying at the same x.
      const bottomEdge = Math.max(...overlapping.map((r) => r.y + r.h))
      const belowCandidate: Rect = { x: natural.x, y: bottomEdge + GAP_FROM_WINDOW, w: natural.w, h: natural.h }
      if (belowCandidate.y + belowCandidate.h <= window.innerHeight && clearOfAll(belowCandidate)) {
        setPosition({ x: belowCandidate.x, y: belowCandidate.y })
        return
      }

      // Fallback: whichever screen corner is clearest of windows.
      const corners: Rect[] = [
        { x: ORB_SIDE_MARGIN, y: ORB_SIDE_MARGIN, w: natural.w, h: natural.h },
        { x: window.innerWidth - ORB_SIDE_MARGIN - natural.w, y: ORB_SIDE_MARGIN, w: natural.w, h: natural.h },
        {
          x: window.innerWidth - ORB_SIDE_MARGIN - natural.w,
          y: window.innerHeight - ORB_SIDE_MARGIN - natural.h,
          w: natural.w,
          h: natural.h,
        },
        { x: ORB_SIDE_MARGIN, y: window.innerHeight - ORB_SIDE_MARGIN - natural.h, w: natural.w, h: natural.h },
      ]
      let best = corners[0]
      let bestOverlapCount = Infinity
      for (const corner of corners) {
        const count = winRects.filter((r) => rectsOverlap(corner, r)).length
        if (count === 0) {
          best = corner
          bestOverlapCount = 0
          break
        }
        if (count < bestOverlapCount) {
          best = corner
          bestOverlapCount = count
        }
      }
      setPosition({ x: best.x, y: best.y })
    }

    recompute()
    window.addEventListener('resize', recompute)
    return () => window.removeEventListener('resize', recompute)
  }, [windows])

  return position
}

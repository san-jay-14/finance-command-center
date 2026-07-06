import { useEffect, useState } from 'react'
import { useWindowsStore } from '../store/windowsStore'

export const ORB_SIZE = 64
export const ORB_BOTTOM_MARGIN = 24
const ORB_SIDE_MARGIN = 20
const GAP_ABOVE_WINDOW = 14

type Rect = { x: number; y: number; w: number; h: number }

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function naturalOrbRect(): Rect {
  return {
    x: window.innerWidth / 2 - ORB_SIZE / 2,
    y: window.innerHeight - ORB_BOTTOM_MARGIN - ORB_SIZE,
    w: ORB_SIZE,
    h: ORB_SIZE,
  }
}

// Recomputed whenever the windows store changes reference (open/close/drag/
// resize all produce a new array) and on viewport resize. Returns a
// translate offset from the orb's default dock — {0,0} means "no window
// overlaps, sit at the default position."
export function useOrbOffset(): { x: number; y: number } {
  const windows = useWindowsStore((s) => s.windows)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  useEffect(() => {
    function recompute() {
      const natural = naturalOrbRect()
      const winRects = windows.map((w) => ({ x: w.position.x, y: w.position.y, w: w.size.w, h: w.size.h }))
      const overlapping = winRects.filter((r) => rectsOverlap(natural, r))

      if (overlapping.length === 0) {
        setOffset({ x: 0, y: 0 })
        return
      }

      const clearOfAll = (rect: Rect) => !winRects.some((r) => rectsOverlap(rect, r))

      // First preference: slide up just above the topmost overlapping
      // window's edge, staying horizontally centered relative to default.
      const topEdge = Math.min(...overlapping.map((r) => r.y))
      const aboveCandidate: Rect = { x: natural.x, y: topEdge - ORB_SIZE - GAP_ABOVE_WINDOW, w: ORB_SIZE, h: ORB_SIZE }
      if (aboveCandidate.y >= 0 && clearOfAll(aboveCandidate)) {
        setOffset({ x: aboveCandidate.x - natural.x, y: aboveCandidate.y - natural.y })
        return
      }

      // Fallback: whichever screen corner is clearest of windows.
      const corners: Rect[] = [
        { x: ORB_SIDE_MARGIN, y: ORB_SIDE_MARGIN, w: ORB_SIZE, h: ORB_SIZE },
        { x: window.innerWidth - ORB_SIDE_MARGIN - ORB_SIZE, y: ORB_SIDE_MARGIN, w: ORB_SIZE, h: ORB_SIZE },
        {
          x: window.innerWidth - ORB_SIDE_MARGIN - ORB_SIZE,
          y: window.innerHeight - ORB_SIDE_MARGIN - ORB_SIZE,
          w: ORB_SIZE,
          h: ORB_SIZE,
        },
        { x: ORB_SIDE_MARGIN, y: window.innerHeight - ORB_SIDE_MARGIN - ORB_SIZE, w: ORB_SIZE, h: ORB_SIZE },
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
      setOffset({ x: best.x - natural.x, y: best.y - natural.y })
    }

    recompute()
    window.addEventListener('resize', recompute)
    return () => window.removeEventListener('resize', recompute)
  }, [windows])

  return offset
}

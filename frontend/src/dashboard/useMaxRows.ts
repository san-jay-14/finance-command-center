import { useEffect, useRef, useState } from 'react'

// Row capping is computed from the container's real measured height, not a
// hardcoded count — the no-scroll constraint means columns must self-truncate
// at any viewport size. `reservedBottom` keeps space clear (e.g. the voice
// orb area at the foot of the activity column).
export function useMaxRows(rowHeight: number, reservedBottom = 0) {
  const ref = useRef<HTMLDivElement>(null)
  const [maxRows, setMaxRows] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () =>
      setMaxRows(Math.max(0, Math.floor((el.clientHeight - reservedBottom) / rowHeight)))
    // Measure synchronously on mount — ResizeObserver delivery waits for the
    // next rendering step, which would flash an empty column first.
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [rowHeight, reservedBottom])

  return { ref, maxRows }
}

// When truncating, the "+N more" line itself takes a row slot so the list
// never overflows: show (maxRows - 1) items and fold the rest into N.
export function capRows<T>(items: T[], maxRows: number): { visible: T[]; hiddenCount: number } {
  if (maxRows <= 0) return { visible: [], hiddenCount: items.length }
  if (items.length <= maxRows) return { visible: items, hiddenCount: 0 }
  const visible = items.slice(0, Math.max(0, maxRows - 1))
  return { visible, hiddenCount: items.length - visible.length }
}

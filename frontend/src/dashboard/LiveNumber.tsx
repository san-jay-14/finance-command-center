import { useEffect, useRef, useState } from 'react'

const prefersReducedMotion =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// The signature transition for live figures: the outgoing value blurs and
// fades, then the new one resolves from blur into focus. CSS handles the
// easing (.blur-resolve in index.css); this just sequences the swap.
export function LiveNumber({ value, className = '' }: { value: string; className?: string }) {
  const [shown, setShown] = useState(value)
  const [blurred, setBlurred] = useState(false)
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    if (value === shown) return
    if (prefersReducedMotion) {
      setShown(value)
      return
    }
    setBlurred(true)
    timeoutRef.current = window.setTimeout(() => {
      setShown(value)
      setBlurred(false)
    }, 170)
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    }
  }, [value, shown])

  return <span className={`blur-resolve ${blurred ? 'is-blurred' : ''} ${className}`}>{shown}</span>
}

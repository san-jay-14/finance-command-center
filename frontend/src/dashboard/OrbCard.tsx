import { useEffect, useRef } from 'react'
import { setOrbHomeRect } from '../orb/orbHomeRect'

export const ORB_CARD_SIZE = 96

// Reserves layout space and renders the static circular frame for the voice
// orb's home slot — now inside the purple net-worth banner, on the right
// side. The actual interactive orb (VoiceOrb.tsx) is a fixed-position
// overlay that tracks this slot's on-screen rect, so it can detach and
// dodge floating windows without disrupting page layout/scroll.
export function OrbCard() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setOrbHomeRect(el.getBoundingClientRect())
    update()
    // ResizeObserver only fires when this element's own box size changes —
    // it stays silent when a viewport resize/reflow shifts the slot's
    // *position* without changing its size, which left the cached rect (and
    // therefore the orb) stuck at a stale spot. Window resize covers that.
    const observer = new ResizeObserver(update)
    observer.observe(el)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      setOrbHomeRect(null)
    }
  }, [])

  return (
    <div
      ref={ref}
      className="shrink-0 rounded-full bg-white/15 p-1 shadow-[inset_0_2px_10px_rgba(0,0,0,0.15)] backdrop-blur-sm"
      style={{ width: ORB_CARD_SIZE, height: ORB_CARD_SIZE }}
    >
      <div className="h-full w-full overflow-hidden rounded-full bg-white/10" />
    </div>
  )
}

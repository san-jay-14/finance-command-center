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
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => {
      observer.disconnect()
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

import { useEffect, useRef } from 'react'
import { useAuth } from './useAuth'
import { useBrokerSession } from './useBrokerSession'
import { useModeStore } from '../store/modeStore'

type GreetingKey = 'demo-signed-out' | 'demo-signed-in' | 'live'

const GREETINGS: Record<GreetingKey, string> = {
  'demo-signed-out':
    "You're in Demo Mode, showing sample data. Sign in at the top right to use the voice assistant, or connect your Angel One account to see your real portfolio.",
  'demo-signed-in':
    "You're signed in. Ask me to log a transaction, check affordability, or run a backtest — or connect your Angel One account any time to see your real live data.",
  live: "You're connected to Angel One, showing your live portfolio. Ask me anything about your account.",
}

// Proactively greets the visitor on every genuine mode/auth transition, not
// just once on page load — demo mode is the default landing state, so the
// assistant introducing itself first (rather than waiting to be asked) is
// the actual onboarding moment for a voice-first app.
//
// Browsers block audio playback before any user gesture on the page, so a
// greeting computed before the first click/keypress is queued and spoken
// once that gesture happens, instead of silently failing to play.
export function useVoiceOnboarding(speakMessage: (text: string) => Promise<void>): void {
  const { user, loading: authLoading } = useAuth()
  const { loading: brokerLoading } = useBrokerSession()
  const mode = useModeStore((s) => s.mode)

  const speakMessageRef = useRef(speakMessage)
  speakMessageRef.current = speakMessage

  const greetedKeyRef = useRef<GreetingKey | null>(null)
  const hasInteractedRef = useRef(false)
  const pendingGreetingRef = useRef<string | null>(null)

  useEffect(() => {
    function markInteracted() {
      hasInteractedRef.current = true
      if (pendingGreetingRef.current) {
        const text = pendingGreetingRef.current
        pendingGreetingRef.current = null
        speakMessageRef.current(text)
      }
    }
    window.addEventListener('pointerdown', markInteracted, { once: true })
    window.addEventListener('keydown', markInteracted, { once: true })
    return () => {
      window.removeEventListener('pointerdown', markInteracted)
      window.removeEventListener('keydown', markInteracted)
    }
  }, [])

  useEffect(() => {
    if (authLoading || brokerLoading) return

    const key: GreetingKey = mode === 'live' ? 'live' : user ? 'demo-signed-in' : 'demo-signed-out'
    if (greetedKeyRef.current === key) return
    greetedKeyRef.current = key

    const text = GREETINGS[key]
    if (hasInteractedRef.current) {
      speakMessageRef.current(text)
    } else {
      pendingGreetingRef.current = text
    }
  }, [mode, user, authLoading, brokerLoading])
}

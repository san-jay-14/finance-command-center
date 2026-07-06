import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { getSpeechRecognitionCtor, isSpeechRecognitionSupported } from '../lib/speech'
import { ORB_BOTTOM_MARGIN, ORB_SIZE, useOrbOffset } from './useOrbOffset'
import { setOrbRect } from './orbRect'

type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking'

type VoiceOrbProps = {
  onSubmit: (message: string, viaVoice: boolean) => void
  pending: boolean
  speaking: boolean
}

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable
}

const GLOW_CLASS: Record<OrbState, string> = {
  idle: 'orb-glow-idle',
  listening: 'orb-glow-listening',
  thinking: 'orb-glow-thinking',
  speaking: 'orb-glow-speaking',
}

// Push-to-talk: hold spacebar to talk, release to send — not click-to-toggle.
// Reuses the same SpeechRecognition + ElevenLabs pipeline the earlier
// click-based VoiceInput used; only the trigger mechanism changes here.
export function VoiceOrb({ onSubmit, pending, speaking }: VoiceOrbProps) {
  const [listening, setListening] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const transcriptRef = useRef('')
  const onSubmitRef = useRef(onSubmit)
  onSubmitRef.current = onSubmit
  const listeningRef = useRef(false)
  const pendingRef = useRef(pending)
  pendingRef.current = pending
  const orbElRef = useRef<HTMLDivElement>(null)
  const supported = isSpeechRecognitionSupported()

  const offset = useOrbOffset()

  // ---- SpeechRecognition setup — bound once, read latest via refs so it
  // never needs recreating (which would abort an in-progress session). ----
  useEffect(() => {
    if (!supported) return
    const Ctor = getSpeechRecognitionCtor()!
    const recognition = new Ctor()
    // continuous=true: push-to-talk means the user controls start/stop
    // directly, so we shouldn't auto-finalize on a mid-sentence pause while
    // the key is still held.
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-IN'

    recognition.onstart = () => {
      setErrorMessage(null)
      setListening(true)
      transcriptRef.current = ''
    }

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) transcriptRef.current += result[0].transcript
      }
    }

    recognition.onerror = (event) => {
      setListening(false)
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setErrorMessage('Microphone access was denied. Allow mic permission to use voice input.')
      } else if (event.error === 'no-speech') {
        setErrorMessage("Didn't catch any speech — try again.")
      } else if (event.error === 'audio-capture') {
        setErrorMessage('No microphone was found.')
      } else if (event.error === 'network') {
        setErrorMessage('Voice input error: network')
        navigator.brave?.isBrave().then((isBrave) => {
          if (isBrave) {
            setErrorMessage(
              'Brave blocks voice recognition by default. Enable "Use Google services for speech recognition" in brave://settings/privacy (or lower Shields for this site), then try again.',
            )
          }
        })
      } else {
        setErrorMessage(`Voice input error: ${event.error}`)
      }
    }

    // Flush whatever finalized here — .stop() (called on keyup) prompts the
    // engine to finalize and then fire onend, so this is where push-to-talk
    // actually delivers its transcript.
    recognition.onend = () => {
      setListening(false)
      const transcript = transcriptRef.current.trim()
      transcriptRef.current = ''
      if (transcript) onSubmitRef.current(transcript, true)
    }

    recognitionRef.current = recognition
    return () => recognition.abort()
  }, [supported])

  // ---- Push-to-talk key handling — guarded against typing targets. ----
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code !== 'Space' && e.key !== ' ') return
      if (isTypingTarget(document.activeElement)) return // let the space type normally
      if (e.repeat) return // ignore OS key-repeat while held
      if (!supported || pendingRef.current || listeningRef.current) return
      e.preventDefault()
      try {
        recognitionRef.current?.start()
      } catch {
        // Already-started race (release+re-press faster than onend fires) —
        // harmless, the in-flight session continues.
      }
    }
    function handleKeyUp(e: KeyboardEvent) {
      if (e.code !== 'Space' && e.key !== ' ') return
      if (isTypingTarget(document.activeElement)) return
      if (!listeningRef.current) return
      recognitionRef.current?.stop()
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [supported])

  useEffect(() => {
    listeningRef.current = listening
  }, [listening])

  // Track the orb's real screen rect for the window-open genie animation to
  // originate from — size changes via ResizeObserver, position changes via
  // the reposition offset (transform doesn't trigger ResizeObserver).
  useEffect(() => {
    const el = orbElRef.current
    if (!el) return
    const update = () => setOrbRect(el.getBoundingClientRect())
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const el = orbElRef.current
    if (el) setOrbRect(el.getBoundingClientRect())
  }, [offset])

  const state: OrbState = listening ? 'listening' : pending ? 'thinking' : speaking ? 'speaking' : 'idle'

  return (
    <motion.div
      ref={orbElRef}
      className="fixed"
      style={{
        left: `calc(50% - ${ORB_SIZE / 2}px)`,
        bottom: ORB_BOTTOM_MARGIN,
        width: ORB_SIZE,
        height: ORB_SIZE,
        zIndex: 100000,
      }}
      animate={{ x: offset.x, y: offset.y }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      {errorMessage && (
        <div className="absolute bottom-full left-1/2 mb-2 w-56 -translate-x-1/2 rounded-lg bg-black/80 px-3 py-2 text-center text-[11px] text-loss shadow-lg">
          {errorMessage}
        </div>
      )}
      <div className={`absolute -inset-3 rounded-full blur-xl ${GLOW_CLASS[state]}`} />
      <div
        className="relative flex h-full w-full items-center justify-center rounded-full border border-gold/30 bg-black/60 text-lg backdrop-blur-sm"
        title={
          !supported
            ? "This browser doesn't support voice input"
            : 'Hold spacebar to talk'
        }
        aria-label={`Voice assistant: ${state}`}
      >
        🎙️
      </div>
    </motion.div>
  )
}

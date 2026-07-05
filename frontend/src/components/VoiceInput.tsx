import { useEffect, useRef, useState, type FormEvent } from 'react'
import { getSpeechRecognitionCtor, isSpeechRecognitionSupported } from '../lib/speech'

type VoiceInputProps = {
  onSubmit: (message: string, viaVoice?: boolean) => void
  pending?: boolean
}

// Voice is an alternate way to produce the same text message handle-message
// already accepts (PROJECT_BRIEF.md section 8, step 10) — no separate code
// path, just a different way to fill in `value` before the same onSubmit
// the text input already uses.
export function VoiceInput({ onSubmit, pending }: VoiceInputProps) {
  const [value, setValue] = useState('')
  const [listening, setListening] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  // onSubmit is a new closure every App render (chatLog/pending updates) —
  // reading it via ref keeps the recognition instance (and an in-progress
  // listening session) alive across those re-renders instead of recreating
  // it and aborting the mic every time.
  const onSubmitRef = useRef(onSubmit)
  onSubmitRef.current = onSubmit
  const supported = isSpeechRecognitionSupported()

  useEffect(() => {
    if (!supported) return
    const Ctor = getSpeechRecognitionCtor()!
    const recognition = new Ctor()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-IN'

    recognition.onstart = () => {
      setErrorMessage(null)
      setListening(true)
      setValue('')
    }

    recognition.onresult = (event) => {
      let interim = ''
      let final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          final += result[0].transcript
        } else {
          interim += result[0].transcript
        }
      }
      if (final.trim()) {
        setValue('')
        onSubmitRef.current(final.trim(), true)
      } else {
        setValue(interim)
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

    recognition.onend = () => setListening(false)

    recognitionRef.current = recognition
    return () => {
      recognition.abort()
      recognitionRef.current = null
    }
  }, [supported])

  function toggleListening() {
    if (!recognitionRef.current || pending) return
    if (listening) {
      recognitionRef.current.stop()
    } else {
      setValue('')
      recognitionRef.current.start()
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || pending) return
    onSubmit(trimmed, false)
    setValue('')
  }

  const infoLine = errorMessage
    ? errorMessage
    : !supported
      ? "Voice input isn't supported in this browser — use text below."
      : listening
        ? 'Listening…'
        : pending
          ? 'Waiting for response…'
          : null

  return (
    <div className="flex flex-col gap-1.5">
      {infoLine && (
        <div className={`px-2 text-xs ${errorMessage ? 'text-red-600' : 'text-neutral-500'}`}>{infoLine}</div>
      )}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-3 rounded-full border border-neutral-300 bg-white px-4 py-3 shadow-sm"
      >
        <button
          type="button"
          onClick={toggleListening}
          disabled={!supported || pending}
          aria-label={listening ? 'Stop voice input' : 'Start voice input'}
          title={!supported ? "This browser doesn't support voice input — use text instead." : undefined}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40 ${
            listening ? 'animate-pulse bg-red-600' : 'bg-neutral-900'
          }`}
        >
          🎤
        </button>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={pending || listening}
          placeholder={
            supported ? 'Ask or tell your finance assistant something...' : "Voice isn't supported — type instead"
          }
          className="flex-1 bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={pending || listening || !value.trim()}
          className="rounded-full bg-neutral-900 px-4 py-1.5 text-sm text-white disabled:opacity-40"
        >
          {pending ? '…' : 'Send'}
        </button>
      </form>
    </div>
  )
}

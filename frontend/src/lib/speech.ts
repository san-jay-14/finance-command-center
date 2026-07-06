import { fetchSpeechAudio } from './api'
import { normalizeForSpeech } from './ttsNormalize'

export function isSpeechRecognitionSupported(): boolean {
  return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

export function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | null {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

// Cancel any in-flight utterance first so voice confirmations from rapid
// consecutive turns don't queue up and talk over each other. Resolves once
// speech actually finishes — the orb's "speaking" visual state is driven by
// this promise's lifetime, not just by when playback starts.
function speakWithBrowserTts(text: string): Promise<void> {
  if (!isSpeechSynthesisSupported() || !text.trim()) return Promise.resolve()
  window.speechSynthesis.cancel()
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.addEventListener('end', () => resolve(), { once: true })
    utterance.addEventListener('error', () => resolve(), { once: true })
    window.speechSynthesis.speak(utterance)
  })
}

// ElevenLabs (flash v2.5) is the primary voice; browser SpeechSynthesis is
// only a fallback if that call fails (down, rate-limited, key not yet
// configured) so voice output never just goes silent.
export async function speak(text: string): Promise<void> {
  const normalized = normalizeForSpeech(text)
  if (!normalized) return

  try {
    const audioBlob = await fetchSpeechAudio(normalized)
    const url = URL.createObjectURL(audioBlob)
    const audio = new Audio(url)
    await audio.play()
    // play() resolves once playback *starts* — wait for it to actually end
    // (or error) so callers tracking an "is speaking" state get the real
    // duration, not just the moment audio began.
    await new Promise<void>((resolve) => {
      audio.addEventListener(
        'ended',
        () => {
          URL.revokeObjectURL(url)
          resolve()
        },
        { once: true },
      )
      audio.addEventListener(
        'error',
        () => {
          URL.revokeObjectURL(url)
          resolve()
        },
        { once: true },
      )
    })
  } catch (err) {
    console.warn('ElevenLabs speech failed, falling back to browser speech synthesis:', err)
    await speakWithBrowserTts(normalized)
  }
}

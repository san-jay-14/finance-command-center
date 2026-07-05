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
// consecutive turns don't queue up and talk over each other.
function speakWithBrowserTts(text: string): void {
  if (!isSpeechSynthesisSupported() || !text.trim()) return
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
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
    audio.addEventListener('ended', () => URL.revokeObjectURL(url))
    audio.addEventListener('error', () => URL.revokeObjectURL(url))
    await audio.play()
  } catch (err) {
    console.warn('ElevenLabs speech failed, falling back to browser speech synthesis:', err)
    speakWithBrowserTts(normalized)
  }
}

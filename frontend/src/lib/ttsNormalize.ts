import { ToWords } from 'to-words'

// en-IN gives correct lakh/crore grouping — plain Western-locale word
// conversion would misread Indian-grouped figures like ₹8,00,000.
const toWords = new ToWords({
  localeCode: 'en-IN',
  converterOptions: { currency: true, doNotAddOnly: true },
})
const toWordsPlain = new ToWords({ localeCode: 'en-IN' })

const CURRENCY_RE = /₹\s?(-?[\d,]+(?:\.\d+)?)/g
const PERCENT_RE = /(-?\d+(?:\.\d+)?)\s?%/g
const ISO_DATE_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/g
const BOLD_RE = /\*\*(.*?)\*\*/g
const EMOJI_RE = /[\u{2705}\u{274C}\u{2139}\u{FE0F}\u{2796}\u{23ED}]/gu

// Browser/ElevenLabs TTS both read ₹12,450 as "one two comma four five zero"
// or spell out digits one at a time — converting to words sidesteps that
// entirely instead of trying to coax the engine into parsing the symbol.
export function normalizeForSpeech(text: string): string {
  let out = text.replace(BOLD_RE, '$1').replace(EMOJI_RE, '')

  out = out.replace(CURRENCY_RE, (match, numStr: string) => {
    const value = Number(numStr.replace(/,/g, ''))
    if (Number.isNaN(value)) return match
    return toWords.convert(value, { currency: true })
  })

  out = out.replace(PERCENT_RE, (match, numStr: string) => {
    const value = Number(numStr)
    if (Number.isNaN(value)) return match
    return `${toWordsPlain.convert(value)} percent`
  })

  out = out.replace(ISO_DATE_RE, (match, y: string, m: string, d: string) => {
    const date = new Date(Number(y), Number(m) - 1, Number(d))
    if (Number.isNaN(date.getTime())) return match
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  })

  return out.replace(/\s+/g, ' ').trim()
}

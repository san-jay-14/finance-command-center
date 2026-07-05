import { useEffect, useRef, useState } from 'react'
import { Canvas } from './components/Canvas'
import { InsightsBanner } from './components/InsightsBanner'
import { VoiceInput } from './components/VoiceInput'
import { useLivePrices } from './hooks/useLivePrices'
import { fetchProactiveInsights, sendMessage } from './lib/api'
import { speak } from './lib/speech'
import type { RenderSpec } from './lib/types'

const USER_ID = import.meta.env.VITE_USER_ID

type ChatEntry = { role: 'user' | 'assistant'; text: string }

// Sidebar-free, single-page layout per PROJECT_BRIEF.md section 1. The
// canvas renders whatever render_ui spec Claude's intent router returns,
// via the component registry (section 6) — no fixed pages/routing.
function App() {
  const [canvasSpec, setCanvasSpec] = useState<RenderSpec | null>(null)
  const [chatLog, setChatLog] = useState<ChatEntry[]>([])
  const [pending, setPending] = useState(false)
  const [insights, setInsights] = useState<string[]>([])
  const livePrices = useLivePrices()
  // Tracks whether the proactive briefing has been spoken yet this session —
  // a ref, not state, since reading it shouldn't trigger a re-render.
  const briefedRef = useRef(false)

  useEffect(() => {
    fetchProactiveInsights(USER_ID)
      .then((res) => setInsights(res.insights))
      .catch((err) => console.warn('Failed to load proactive insights:', err))
  }, [])

  function speakIfVoice(text: string) {
    // Browsers block unprompted audio autoplay, so the briefing can't just
    // play itself on load — instead it piggybacks on the very first voice
    // interaction's user gesture, prepended to whatever's actually spoken.
    if (!briefedRef.current && insights.length > 0) {
      briefedRef.current = true
      speak(`${insights.join(' ')} Now, about what you asked: ${text}`)
    } else {
      speak(text)
    }
  }

  function briefNow() {
    briefedRef.current = true
    speak(insights.join(' '))
  }

  // viaVoice gates spoken output only — voice reuses the exact same
  // sendMessage/handle-message path text already uses (brief section 8, step
  // 10), it just also talks back since there's no input box to reassure you
  // something happened.
  async function handleSend(message: string, viaVoice = false) {
    setChatLog((log) => [...log, { role: 'user', text: message }])
    setPending(true)
    try {
      const response = await sendMessage(message, USER_ID)
      if (response.tool === 'render_ui') {
        const confirmation = `Showing ${response.component.replace(/_/g, ' ')}.`
        setCanvasSpec({ component: response.component, data: response.data })
        setChatLog((log) => [...log, { role: 'assistant', text: confirmation }])
        if (viaVoice) speakIfVoice(confirmation)
      } else if (response.tool === 'check_affordability') {
        // Combines a natural-language explanation (chat) with the visual
        // three-check breakdown (canvas) — not just text, per the brief.
        setCanvasSpec({ component: 'affordability_result', data: response.result })
        setChatLog((log) => [...log, { role: 'assistant', text: response.message }])
        if (viaVoice) speakIfVoice(response.message)
      } else if (response.tool === 'run_backtest') {
        setCanvasSpec({ component: 'backtest_result', data: response.result })
        setChatLog((log) => [...log, { role: 'assistant', text: response.message }])
        if (viaVoice) speakIfVoice(response.message)
      } else if (response.tool === 'show_price_chart') {
        // message is a short % change summary, not the whole candle series —
        // that's what gets spoken/shown in chat, while the full data renders
        // as the candlestick chart in the canvas.
        setCanvasSpec({ component: 'candlestick_chart', data: response.result })
        setChatLog((log) => [...log, { role: 'assistant', text: response.message }])
        if (viaVoice) speakIfVoice(response.message)
      } else {
        setChatLog((log) => [...log, { role: 'assistant', text: response.message }])
        if (viaVoice) speakIfVoice(response.message)
      }
    } catch (err) {
      const errorText = `Something went wrong: ${(err as Error).message}`
      setChatLog((log) => [...log, { role: 'assistant', text: errorText }])
      if (viaVoice) speakIfVoice(errorText)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <header className="border-b border-neutral-200 px-6 py-4">
        <h1 className="text-lg font-semibold text-neutral-900">Finance Command Center</h1>
      </header>

      <main className="flex flex-1 flex-col gap-4 p-6">
        <InsightsBanner insights={insights} onBriefMe={briefNow} />

        {chatLog.length > 0 && (
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-4 text-sm">
            {chatLog.map((entry, i) => (
              <div key={i} className={entry.role === 'user' ? 'text-neutral-900' : 'text-neutral-600'}>
                <span className="font-medium">{entry.role === 'user' ? 'You: ' : 'Assistant: '}</span>
                {entry.text}
              </div>
            ))}
          </div>
        )}

        <div id="canvas" className="mx-auto w-full max-w-4xl flex-1 rounded-xl border border-dashed border-neutral-300 bg-white">
          <Canvas spec={canvasSpec} livePrices={livePrices} />
        </div>
      </main>

      <footer className="px-6 py-6">
        <div className="mx-auto max-w-2xl">
          <VoiceInput onSubmit={handleSend} pending={pending} />
        </div>
      </footer>
    </div>
  )
}

export default App

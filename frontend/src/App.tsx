import { useState } from 'react'
import { Dashboard } from './dashboard/Dashboard'
import { useLivePrices } from './hooks/useLivePrices'
import { sendMessage, type HandleMessageResponse } from './lib/api'
import { speak } from './lib/speech'
import { TextFallbackInput } from './orb/TextFallbackInput'
import { VoiceOrb } from './orb/VoiceOrb'
import { useWindowsStore } from './store/windowsStore'
import { WindowsLayer } from './windows/WindowsLayer'

const USER_ID = import.meta.env.VITE_USER_ID

function titleForComponent(component: string): string {
  return component
    .split('_')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}

// The assistant surface returns here as an orb (push-to-talk voice) + a
// floating window system, replacing the earlier single-canvas + chat-log
// design. There's no text transcript anymore — every response is spoken
// (orb's "speaking" state) and/or opens a window; the text input is only the
// always-visible typed fallback.
function App() {
  const [pending, setPending] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const livePrices = useLivePrices()
  const openWindow = useWindowsStore((s) => s.openWindow)
  const closeWindowsByTitles = useWindowsStore((s) => s.closeWindowsByTitles)
  const closeAll = useWindowsStore((s) => s.closeAll)

  async function speakMessage(text: string) {
    setSpeaking(true)
    try {
      await speak(text)
    } finally {
      setSpeaking(false)
    }
  }

  async function handleResponse(response: HandleMessageResponse) {
    switch (response.tool) {
      case 'render_ui': {
        const title = titleForComponent(response.component)
        openWindow(response.component, response.data, title)
        await speakMessage(`Showing ${title}.`)
        break
      }
      case 'check_affordability':
        openWindow('affordability_result', response.result, 'Affordability Check')
        await speakMessage(response.message)
        break
      case 'run_backtest': {
        const symbol = typeof response.result.symbol === 'string' ? response.result.symbol : 'Backtest'
        openWindow('backtest_result', response.result, `${symbol} Backtest`)
        await speakMessage(response.message)
        break
      }
      case 'show_price_chart': {
        const symbol = typeof response.result.symbol === 'string' ? response.result.symbol : 'Chart'
        openWindow('candlestick_chart', response.result, `${symbol} Chart`)
        await speakMessage(response.message)
        break
      }
      case 'close_window':
        closeWindowsByTitles(response.titles)
        await speakMessage(response.message)
        break
      case 'close_all_windows':
        closeAll()
        await speakMessage(response.message)
        break
      default:
        await speakMessage(response.message)
    }
  }

  // _viaVoice is accepted (both the orb and the text fallback pass it) but
  // doesn't change behavior — with no chat transcript left, every response
  // speaks regardless of how it was typed/said.
  async function handleSend(message: string, _viaVoice: boolean) {
    setPending(true)
    let response: HandleMessageResponse
    try {
      const openTitles = useWindowsStore.getState().windows.map((w) => w.title)
      response = await sendMessage(message, USER_ID, openTitles)
    } catch (err) {
      setPending(false)
      await speakMessage(`Something went wrong: ${(err as Error).message}`)
      return
    }
    setPending(false)
    await handleResponse(response)
  }

  return (
    <>
      <Dashboard livePrices={livePrices} />
      <WindowsLayer livePrices={livePrices} />
      <VoiceOrb onSubmit={handleSend} pending={pending} speaking={speaking} />
      {/* Positioned clear of the orb's bottom-center dock, not competing for
          the same space — this is the always-visible typed fallback. */}
      <div className="fixed right-4 bottom-4 z-30 w-72">
        <TextFallbackInput onSubmit={handleSend} pending={pending} />
      </div>
    </>
  )
}

export default App

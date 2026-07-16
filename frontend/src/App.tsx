import { useState } from 'react'
import { Toaster } from 'sonner'
import { Dashboard } from './dashboard/Dashboard'
import { useLivePrices } from './hooks/useLivePrices'
import { useTransactionToasts } from './hooks/useTransactionToasts'
import { ModeBanner } from './components/ModeBanner'
import { sendMessage, type HandleMessageResponse } from './lib/api'
import { speak } from './lib/speech'
import { VoiceOrb } from './orb/VoiceOrb'
import { useModeStore } from './store/modeStore'
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
// design. There's no text transcript and no typed fallback anymore — voice
// (push-to-talk) is the only input. Live activity now surfaces as toasts
// (useTransactionToasts) instead of a permanent activity column.
function App() {
  const [pending, setPending] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const mode = useModeStore((s) => s.mode)
  const livePrices = useLivePrices(mode)
  const openWindow = useWindowsStore((s) => s.openWindow)
  const closeWindowsByTitles = useWindowsStore((s) => s.closeWindowsByTitles)
  const closeAll = useWindowsStore((s) => s.closeAll)
  useTransactionToasts()

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
      case 'show_activity_history':
        openWindow('activity_history', { activity: response.activity }, 'Activity History')
        await speakMessage(response.message)
        break
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

  // _viaVoice is accepted (VoiceOrb always passes true) but doesn't change
  // behavior — every response speaks regardless.
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
      <Toaster position="top-right" richColors theme="dark" />
      <ModeBanner />
      <Dashboard livePrices={livePrices} />
      <WindowsLayer livePrices={livePrices} />
      <VoiceOrb onSubmit={handleSend} pending={pending} speaking={speaking} />
    </>
  )
}

export default App

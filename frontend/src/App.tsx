import { useState } from 'react'
import { Toaster } from 'sonner'
import { Dashboard } from './dashboard/Dashboard'
import { useAuth } from './hooks/useAuth'
import { useLivePrices } from './hooks/useLivePrices'
import { useTransactionToasts } from './hooks/useTransactionToasts'
import { ModeBanner } from './components/ModeBanner'
import { useModeSync } from './hooks/useModeSync'
import { useVoiceOnboarding } from './hooks/useVoiceOnboarding'
import { sendMessage, type HandleMessageResponse } from './lib/api'
import { speak } from './lib/speech'
import { VoiceOrb } from './orb/VoiceOrb'
import { useModeStore } from './store/modeStore'
import { useWindowsStore } from './store/windowsStore'
import { WindowsLayer } from './windows/WindowsLayer'

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
  useModeSync()
  const { user } = useAuth()
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

  useVoiceOnboarding(speakMessage)

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
    // Voice writes are per-signed-in-user now (Step 9 write-path safety) —
    // an anonymous demo visitor has nowhere safe for handle-message to
    // write, so the assistant simply isn't reachable until they sign in.
    if (!user) {
      await speakMessage('Please sign in first to use the voice assistant.')
      return
    }

    setPending(true)
    const openTitles = useWindowsStore.getState().windows.map((w) => w.title)
    const result = await sendMessage(message, openTitles)
    setPending(false)
    if (!result.ok) {
      await speakMessage(`Something went wrong: ${result.error}`)
      return
    }
    await handleResponse(result.response)
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

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Mode } from '../store/modeStore'

export type LivePrices = Record<string, { ltp: number; timestamp: string }>

// Subscribes to the same "price-ticks" Realtime broadcast channel the relay
// service pushes Angel One WebSocket ticks into, keeping a live in-memory
// map of symbol -> latest price for rendered components to read. In demo
// mode this never subscribes at all — no broker-related call happens.
export function useLivePrices(mode: Mode): LivePrices {
  const [prices, setPrices] = useState<LivePrices>({})

  useEffect(() => {
    if (mode !== 'live') {
      setPrices({})
      return
    }

    const channel = supabase.channel('price-ticks')
    channel.on('broadcast', { event: 'tick' }, ({ payload }) => {
      const { symbol, ltp, timestamp } = payload as { symbol: string; ltp: number; timestamp: string }
      setPrices((prev) => ({ ...prev, [symbol]: { ltp, timestamp } }))
    })
    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [mode])

  return prices
}

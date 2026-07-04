import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export type LivePrices = Record<string, { ltp: number; timestamp: string }>

// Subscribes to the same "price-ticks" Realtime broadcast channel the relay
// service pushes Angel One WebSocket ticks into, keeping a live in-memory
// map of symbol -> latest price for rendered components to read.
export function useLivePrices(): LivePrices {
  const [prices, setPrices] = useState<LivePrices>({})

  useEffect(() => {
    const channel = supabase.channel('price-ticks')
    channel.on('broadcast', { event: 'tick' }, ({ payload }) => {
      const { symbol, ltp, timestamp } = payload as { symbol: string; ltp: number; timestamp: string }
      setPrices((prev) => ({ ...prev, [symbol]: { ltp, timestamp } }))
    })
    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return prices
}

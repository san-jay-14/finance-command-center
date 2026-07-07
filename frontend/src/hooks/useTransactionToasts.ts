import { useEffect } from 'react'
import { toast } from 'sonner'
import { describeTransaction } from '../dashboard/format'
import { supabase } from '../lib/supabaseClient'

// Subscribes to the "transactions" Realtime broadcast channel the backend
// pushes to on every insert (handle-message's log_transaction, and
// process-recurring-rules for cron-fired contributions) — one mechanism
// covers both voice-initiated and background-scheduled activity, replacing
// the old permanent activity column with toast notifications.
export function useTransactionToasts(): void {
  useEffect(() => {
    const channel = supabase.channel('transactions')
    channel.on('broadcast', { event: 'new' }, ({ payload }) => {
      toast(describeTransaction(payload as Parameters<typeof describeTransaction>[0]))
    })
    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])
}

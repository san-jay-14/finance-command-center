import { useEffect } from 'react'
import { toast } from 'sonner'
import { describeTransaction } from '../dashboard/format'
import { useAuth } from './useAuth'
import { supabase } from '../lib/supabaseClient'

// Subscribes to two channels:
// - the legacy global "transactions" topic, still used by
//   process-recurring-rules for the founder's own cron-fired contributions
//   (untouched by Step 9 — see broker_sessions migration notes)
// - a per-owner "transactions:<ownerId>" topic (Step 9), used by
//   handle-message's log_transaction for signed-in visitors' voice activity
//   — was a single shared global topic, which meant every open browser tab
//   got toasted for every other visitor's voice-logged transaction.
export function useTransactionToasts(): void {
  const { user } = useAuth()

  useEffect(() => {
    const legacyChannel = supabase.channel('transactions')
    legacyChannel.on('broadcast', { event: 'new' }, ({ payload }) => {
      toast(describeTransaction(payload as Parameters<typeof describeTransaction>[0]))
    })
    legacyChannel.subscribe()

    let ownerChannel: ReturnType<typeof supabase.channel> | null = null
    if (user) {
      ownerChannel = supabase.channel(`transactions:${user.id}`)
      ownerChannel.on('broadcast', { event: 'new' }, ({ payload }) => {
        toast(describeTransaction(payload as Parameters<typeof describeTransaction>[0]))
      })
      ownerChannel.subscribe()
    }

    return () => {
      supabase.removeChannel(legacyChannel)
      if (ownerChannel) supabase.removeChannel(ownerChannel)
    }
  }, [user])
}

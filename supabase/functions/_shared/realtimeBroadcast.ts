// Mirrors relay-service/app/realtime_broadcast.py — same server-side REST
// endpoint (POST /realtime/v1/api/broadcast) used for the existing
// "price-ticks" channel, reused here for a "transactions" channel so the
// frontend can toast every logged transaction (voice-initiated or
// cron-fired recurring rules) without needing table-level Realtime/RLS
// access.
export async function broadcastRealtime(
  supabaseUrl: string,
  serviceKey: string,
  topic: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages: [{ topic, event, payload }] }),
    });
  } catch {
    // Best-effort — a missed toast shouldn't fail the underlying transaction.
  }
}

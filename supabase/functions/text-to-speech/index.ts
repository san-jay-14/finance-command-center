// Build-order step 10 follow-up: replaces browser SpeechSynthesis with
// ElevenLabs for voice OUTPUT (SpeechRecognition stays for input, unchanged).
// The API key never reaches the browser — this function proxies the call
// and streams ElevenLabs' audio straight through as the response body.
import { corsHeaders } from "../_shared/cors.ts";

const ELEVENLABS_MODEL_ID = "eleven_flash_v2_5"; // low-latency, per spec

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Free-tier ElevenLabs accounts can't call arbitrary library voices via the
// API (402 "paid_plan_required") — only voices already in the account's own
// library. Rather than hardcode an ID that assumes a plan tier, resolve
// whichever voice is actually available and cache it (module scope survives
// across warm invocations, same pattern as the gold-rate/NAV caches in
// _shared/valuation.ts).
let cachedVoiceId: string | null = null;

async function resolveVoiceId(apiKey: string): Promise<string | null> {
  if (cachedVoiceId) return cachedVoiceId;
  const res = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const voiceId = data.voices?.[0]?.voice_id;
  if (!voiceId) return null;
  cachedVoiceId = voiceId;
  return voiceId;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonError("Use POST", 405);
  }

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const text = body.text?.trim();
  if (!text) {
    return jsonError("text is required", 400);
  }

  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (!apiKey) {
    return jsonError("ELEVENLABS_API_KEY is not configured as a project secret", 500);
  }

  const voiceId = await resolveVoiceId(apiKey);
  if (!voiceId) {
    return jsonError("No ElevenLabs voice available on this account (voices list was empty or unreachable)", 502);
  }

  const elevenRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({ text, model_id: ELEVENLABS_MODEL_ID }),
  });

  if (!elevenRes.ok || !elevenRes.body) {
    const detail = await elevenRes.text().catch(() => "");
    return jsonError(`ElevenLabs TTS failed (${elevenRes.status}): ${detail}`, 502);
  }

  return new Response(elevenRes.body, {
    headers: { ...corsHeaders, "Content-Type": "audio/mpeg" },
  });
});

// Persists a captured Angel One Publisher Login session (Step 5's
// /connect/callback tokens) into broker_sessions, Vault-backed, scoped to
// the calling user's own Supabase Auth id. user_id is always derived from
// the caller's verified JWT here, never trusted from the request body —
// otherwise any signed-in visitor could write a session under someone
// else's user_id.
import { createClient } from "npm:@supabase/supabase-js@2";

// Inlined rather than importing ../_shared/* — this function's deploy path
// (via the Supabase MCP tool) doesn't resolve relative imports the same way
// the CLI does for the rest of this repo's functions.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders });
}

function createAdminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST" && req.method !== "DELETE") {
    return json({ error: "Use POST or DELETE" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Missing Authorization header" }, 401);
  }

  const supabase = createAdminClient();
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
  if (userError || !userData.user) {
    return json({ error: "Invalid or expired session" }, 401);
  }

  // Disconnect (Step 8) — deletes the session row and its Vault secrets,
  // returning the user to demo mode. Separate from the connect (POST) path
  // below, sharing only the JWT-verification boilerplate.
  if (req.method === "DELETE") {
    const { error } = await supabase.rpc("delete_broker_session", { p_user_id: userData.user.id });
    if (error) return json({ error: error.message }, 500);
    return json({ disconnected: true });
  }

  let body: {
    auth_token?: string;
    feed_token?: string;
    refresh_token?: string | null;
    client_code?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { auth_token, feed_token, refresh_token, client_code } = body;
  if (!auth_token || !feed_token) {
    return json({ error: "auth_token and feed_token are required" }, 400);
  }

  const { data, error } = await supabase.rpc("upsert_broker_session", {
    p_user_id: userData.user.id,
    p_broker: "angel_one",
    p_client_code: client_code ?? null,
    p_auth_token: auth_token,
    p_feed_token: feed_token,
    p_refresh_token: refresh_token ?? null,
    p_expires_at: nextMidnightIst(),
  });

  if (error) return json({ error: error.message }, 500);

  return json({ session_id: data });
});

// Angel One Publisher sessions die at midnight IST regardless of activity
// (architecture.md) rather than on a fixed TTL from issuance.
function nextMidnightIst(): string {
  const IST_OFFSET_MIN = 5 * 60 + 30;
  const now = new Date();
  const istNow = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
  const istMidnight = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate() + 1);
  return new Date(istMidnight - IST_OFFSET_MIN * 60_000).toISOString();
}

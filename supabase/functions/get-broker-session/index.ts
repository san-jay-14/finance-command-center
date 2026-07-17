// Lightweight connection-status check — used to derive live/demo mode on
// every load (not a one-time flag set at connect-time, since ConnectCallback
// and the dashboard are separate page loads with no persisted mode state)
// and to show the real client_code in the banner. Never reads/decrypts
// tokens — that's get-net-worth-connected's job, via a separate,
// more tightly scoped RPC.
import { createClient } from "npm:@supabase/supabase-js@2";

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

  const { data, error } = await supabase
    .from("broker_sessions")
    .select("client_code, expires_at")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (error) return json({ error: error.message }, 500);
  if (!data) return json({ connected: false });

  const connected = new Date(data.expires_at).getTime() > Date.now();
  return json({ connected, client_code: data.client_code, expires_at: data.expires_at });
});

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-eval-secret",
  // DELETE (and PUT/PATCH) are NOT CORS-safelisted methods, so a browser
  // preflight for them fails unless the method is named here — POST/GET slip
  // through without it, which is why disconnect (DELETE) silently broke while
  // connect (POST) worked. List them explicitly.
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders });
}

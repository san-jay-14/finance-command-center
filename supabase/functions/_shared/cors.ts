export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-eval-secret",
};

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders });
}

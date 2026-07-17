-- Decrypts the caller-derived user's stored broker session tokens, for the
-- live per-visitor data path (Step 7). Mirrors upsert_broker_session's
-- pattern: vault.decrypted_secrets isn't exposed to PostgREST/RPC directly,
-- and isn't grantable to anon/authenticated at all (confirmed empty grants
-- during Step 6 RLS verification) — this security definer wrapper is the
-- only way an edge function can read the plaintext tokens, and only
-- service_role may call it.
create or replace function public.get_broker_session_secrets(p_user_id uuid)
returns table (
  client_code text,
  auth_token text,
  feed_token text,
  refresh_token text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  return query
  select
    bs.client_code,
    (select decrypted_secret from vault.decrypted_secrets where id = bs.auth_token_id),
    (select decrypted_secret from vault.decrypted_secrets where id = bs.feed_token_id),
    case when bs.refresh_token_id is not null
      then (select decrypted_secret from vault.decrypted_secrets where id = bs.refresh_token_id)
      else null
    end,
    bs.expires_at
  from broker_sessions bs
  where bs.user_id = p_user_id;
end;
$$;

revoke all on function public.get_broker_session_secrets from public, anon, authenticated;
grant execute on function public.get_broker_session_secrets to service_role;

-- Lets the update-client-code step (get-net-worth-connected backfilling a
-- null client_code from Angel One's profile response) run without needing
-- the full upsert_broker_session round trip.
create or replace function public.update_broker_session_client_code(p_user_id uuid, p_client_code text)
returns void
language sql
security definer
set search_path = public
as $$
  update broker_sessions set client_code = p_client_code where user_id = p_user_id and client_code is null;
$$;

revoke all on function public.update_broker_session_client_code from public, anon, authenticated;
grant execute on function public.update_broker_session_client_code to service_role;

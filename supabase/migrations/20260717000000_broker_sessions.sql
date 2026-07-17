-- broker_sessions: one row per visitor who has connected their own Angel
-- One account via Publisher Login (Step 5), scoped to Supabase Auth
-- (auth.uid()). Deliberately a separate table from the pre-existing
-- broker_connections (which stores the founder's own relay-service TOTP
-- session under the legacy public.users id, predating Supabase Auth) —
-- mixing the two would conflate unrelated auth mechanisms and risk the
-- founder's live relay credentials.
--
-- auth_token/feed_token/refresh_token are never stored in plain columns —
-- only a reference to a Supabase Vault secret (vault.secrets.id), matching
-- the same pattern broker_connections.totp_secret_vault_id already uses.
create table public.broker_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  broker text not null default 'angel_one',
  -- Angel One's Publisher callback doesn't reliably return a client code as
  -- its own param (only auth_token/feed_token/refresh_token are confirmed);
  -- nullable here, best-effort decoded from the auth_token JWT client-side.
  client_code text,
  auth_token_id uuid not null references vault.secrets(id),
  feed_token_id uuid not null references vault.secrets(id),
  refresh_token_id uuid references vault.secrets(id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- One active connection per user — reconnecting replaces the existing
  -- session (and its vault secrets) rather than accumulating stale rows.
  unique (user_id)
);

alter table public.broker_sessions enable row level security;

create policy "users manage their own broker session"
  on public.broker_sessions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Vault functions live in the `vault` schema, which isn't exposed to
-- PostgREST/RPC (see supabase/config.toml api.schemas) — this wrapper in
-- the exposed `public` schema is the only way an edge function can invoke
-- vault.create_secret/update_secret via supabase-js's .rpc(). It derives
-- and trusts p_user_id from the caller, so only service_role (never
-- anon/authenticated directly) may execute it — the connect-broker-session
-- edge function is responsible for deriving user_id from a verified JWT
-- before calling this, not trusting client-supplied input.
create or replace function public.upsert_broker_session(
  p_user_id uuid,
  p_broker text,
  p_client_code text,
  p_auth_token text,
  p_feed_token text,
  p_refresh_token text,
  p_expires_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_existing record;
  v_refresh_token_id uuid;
  v_session_id uuid;
begin
  select * into v_existing from broker_sessions where user_id = p_user_id;

  if found then
    perform vault.update_secret(v_existing.auth_token_id, p_auth_token);
    perform vault.update_secret(v_existing.feed_token_id, p_feed_token);

    v_refresh_token_id := v_existing.refresh_token_id;
    if p_refresh_token is not null then
      if v_refresh_token_id is not null then
        perform vault.update_secret(v_refresh_token_id, p_refresh_token);
      else
        v_refresh_token_id := vault.create_secret(p_refresh_token);
      end if;
    end if;

    update broker_sessions
    set broker = p_broker,
        client_code = coalesce(p_client_code, client_code),
        refresh_token_id = v_refresh_token_id,
        expires_at = p_expires_at,
        created_at = now()
    where user_id = p_user_id
    returning id into v_session_id;

    return v_session_id;
  end if;

  if p_refresh_token is not null then
    v_refresh_token_id := vault.create_secret(p_refresh_token);
  end if;

  insert into broker_sessions (user_id, broker, client_code, auth_token_id, feed_token_id, refresh_token_id, expires_at)
  values (
    p_user_id,
    p_broker,
    p_client_code,
    vault.create_secret(p_auth_token),
    vault.create_secret(p_feed_token),
    v_refresh_token_id,
    p_expires_at
  )
  returning id into v_session_id;

  return v_session_id;
end;
$$;

revoke all on function public.upsert_broker_session from public, anon, authenticated;
grant execute on function public.upsert_broker_session to service_role;

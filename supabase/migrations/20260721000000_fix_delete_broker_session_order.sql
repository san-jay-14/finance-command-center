-- Fix a foreign-key-violation in delete_broker_session (surfaced once the
-- CORS fix let the disconnect DELETE actually reach the server).
--
-- The original deleted the Vault secrets BEFORE the broker_sessions row, but
-- broker_sessions.auth_token_id / feed_token_id / refresh_token_id each carry
-- a FK to vault.secrets(id). Deleting a secret while the session row still
-- references it violates broker_sessions_auth_token_id_fkey. Delete the child
-- row (broker_sessions) first, then its now-unreferenced parent secrets.
create or replace function public.delete_broker_session(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_existing record;
begin
  select * into v_existing from broker_sessions where user_id = p_user_id;
  if not found then
    return;
  end if;

  -- Child row first (it holds the FKs to vault.secrets), then the secrets it
  -- pointed at — which are now unreferenced and safe to remove.
  delete from broker_sessions where user_id = p_user_id;

  delete from vault.secrets where id = v_existing.auth_token_id;
  delete from vault.secrets where id = v_existing.feed_token_id;
  if v_existing.refresh_token_id is not null then
    delete from vault.secrets where id = v_existing.refresh_token_id;
  end if;
end;
$$;

revoke all on function public.delete_broker_session from public, anon, authenticated;
grant execute on function public.delete_broker_session to service_role;

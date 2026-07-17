-- Disconnect (Step 8): removes the stored session and its Vault secrets for
-- the given user. security definer + service_role-only, same pattern as
-- upsert_broker_session/get_broker_session_secrets — vault.secrets isn't
-- writable by anon/authenticated at all.
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

  delete from vault.secrets where id = v_existing.auth_token_id;
  delete from vault.secrets where id = v_existing.feed_token_id;
  if v_existing.refresh_token_id is not null then
    delete from vault.secrets where id = v_existing.refresh_token_id;
  end if;

  delete from broker_sessions where user_id = p_user_id;
end;
$$;

revoke all on function public.delete_broker_session from public, anon, authenticated;
grant execute on function public.delete_broker_session to service_role;

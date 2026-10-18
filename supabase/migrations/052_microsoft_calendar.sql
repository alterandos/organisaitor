-- Outlook / Microsoft 365 calendar sync (2026-10-18): connections with provider 'microsoft'.
--
-- Additive (docs/android/00-architecture.md ADR-9): both mint_oauth_state overloads keep their
-- signatures and only learn the new provider; Google's save_calendar_connection is untouched; the
-- Microsoft callback (api/microsoft-calendar-oauth-callback.ts) saves through its own function.
-- calendar_connections already has a provider column and is unique on (user_id, provider,
-- account_email), so no table change. No new table, so no grant beyond the new function's own.

create or replace function mint_oauth_state(p_provider text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_nonce text;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_provider not in ('strava', 'google', 'microsoft') then
    raise exception 'unknown provider';
  end if;

  delete from public.oauth_states where expires_at < now() or (user_id = v_user and provider = p_provider);

  v_nonce := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into public.oauth_states (nonce, user_id, provider, expires_at)
  values (v_nonce, v_user, p_provider, now() + interval '10 minutes');

  return v_nonce;
end;
$$;

create or replace function mint_oauth_state(p_provider text, p_client text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_nonce text;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_provider not in ('strava', 'google', 'microsoft') then
    raise exception 'unknown provider';
  end if;
  if p_client not in ('web', 'android') then
    raise exception 'unknown client';
  end if;

  delete from public.oauth_states where expires_at < now() or (user_id = v_user and provider = p_provider);

  v_nonce := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into public.oauth_states (nonce, user_id, provider, expires_at, client)
  values (v_nonce, v_user, p_provider, now() + interval '10 minutes', p_client);

  return v_nonce;
end;
$$;

-- Called by api/microsoft-calendar-oauth-callback.ts with the anon key, as Google's is. Microsoft
-- issues a new refresh token on every grant, so one is always passed; the fallback to the stored
-- one only covers a response without it.
create or replace function save_microsoft_calendar_connection(
  p_nonce         text,
  p_account_email text,
  p_access_token  text,
  p_refresh_token text,
  p_expires_at    bigint,
  p_scope         text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid;
  v_client  text;
  v_refresh text := p_refresh_token;
begin
  delete from public.oauth_states
   where nonce = p_nonce and provider = 'microsoft' and expires_at > now()
  returning user_id, client into v_user, v_client;

  if v_user is null then
    return 'invalid_state';
  end if;

  if v_refresh is null then
    select refresh_token into v_refresh
      from public.calendar_connections
     where user_id = v_user and provider = 'microsoft' and account_email = p_account_email;
  end if;
  if v_refresh is null then
    return 'no_refresh_token';
  end if;

  insert into public.calendar_connections (user_id, provider, account_email, access_token, refresh_token, expires_at, scope, updated_at)
  values (v_user, 'microsoft', p_account_email, p_access_token, v_refresh, p_expires_at, p_scope, now())
  on conflict (user_id, provider, account_email) do update set
    access_token  = excluded.access_token,
    refresh_token = excluded.refresh_token,
    expires_at    = excluded.expires_at,
    scope         = excluded.scope,
    updated_at    = now();

  return case when v_client = 'web' then 'ok' else 'ok:' || v_client end;
end;
$$;

revoke all on function save_microsoft_calendar_connection(text, text, text, text, bigint, text) from public, anon, authenticated;
grant execute on function save_microsoft_calendar_connection(text, text, text, text, bigint, text) to anon;

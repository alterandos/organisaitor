-- OAuth `state` nonces for the Strava and Google Calendar connect flows.
--
-- Before this, the client put the user's live Supabase access token in the OAuth `state`
-- parameter (a full-page redirect can't carry an Authorization header), which leaked a
-- credential into provider/Vercel logs, browser history and Referer headers. Now `state` is a
-- random single-use nonce, minted by the signed-in user (bound to auth.uid() and a provider),
-- valid for 10 minutes, and consumed by the callback when it saves the connection.
--
-- The callback runs with no user session, so it can't write the connection row through RLS.
-- Instead it calls the security-definer save_* functions below with the anon key; those
-- consume the nonce and write the row for the user the nonce was minted for. No service-role
-- key is involved anywhere.

create table oauth_states (
  nonce      text primary key,
  user_id    uuid not null references auth.users on delete cascade,
  provider   text not null check (provider in ('strava', 'google')),
  expires_at timestamptz not null
);

-- RLS on with no policies and no grants: only the security-definer functions touch this table.
alter table oauth_states enable row level security;
revoke all on oauth_states from anon, authenticated;

-- Called by the signed-in client. One live nonce per (user, provider): starting a new flow
-- invalidates the previous one, which also bounds the table's size.
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
  if p_provider not in ('strava', 'google') then
    raise exception 'unknown provider';
  end if;

  delete from public.oauth_states where expires_at < now() or (user_id = v_user and provider = p_provider);

  -- two gen_random_uuid() values (CSPRNG-backed, 122 random bits each), dashes stripped
  v_nonce := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into public.oauth_states (nonce, user_id, provider, expires_at)
  values (v_nonce, v_user, p_provider, now() + interval '10 minutes');

  return v_nonce;
end;
$$;

revoke all on function mint_oauth_state(text) from public, anon, authenticated;
grant execute on function mint_oauth_state(text) to authenticated;

-- Called by api/strava-oauth-callback.ts with the anon key. Returns 'ok' or 'invalid_state'
-- (unknown, already used, expired, or minted for a different provider — deliberately not
-- distinguished). The nonce is deleted in the same statement that validates it, so a second
-- presentation of the same state can never succeed.
create or replace function save_strava_connection(
  p_nonce         text,
  p_athlete_id    bigint,
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
  v_user uuid;
begin
  delete from public.oauth_states
   where nonce = p_nonce and provider = 'strava' and expires_at > now()
  returning user_id into v_user;

  if v_user is null then
    return 'invalid_state';
  end if;

  insert into public.fitness_strava_connection (user_id, athlete_id, access_token, refresh_token, expires_at, scope, updated_at)
  values (v_user, p_athlete_id, p_access_token, p_refresh_token, p_expires_at, p_scope, now())
  on conflict (user_id) do update set
    athlete_id    = excluded.athlete_id,
    access_token  = excluded.access_token,
    refresh_token = excluded.refresh_token,
    expires_at    = excluded.expires_at,
    scope         = excluded.scope,
    updated_at    = now();

  return 'ok';
end;
$$;

revoke all on function save_strava_connection(text, bigint, text, text, bigint, text) from public, anon, authenticated;
grant execute on function save_strava_connection(text, bigint, text, text, bigint, text) to anon;

-- Called by api/google-calendar-oauth-callback.ts. Returns 'ok', 'invalid_state' or
-- 'no_refresh_token'. Google only re-issues a refresh token when prompt=consent forces it (the
-- client always asks), so if the response carried none, keep whatever is already stored for
-- this account. `calendars_enabled` is left untouched on reconnect, as before.
create or replace function save_calendar_connection(
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
  v_refresh text := p_refresh_token;
begin
  delete from public.oauth_states
   where nonce = p_nonce and provider = 'google' and expires_at > now()
  returning user_id into v_user;

  if v_user is null then
    return 'invalid_state';
  end if;

  if v_refresh is null then
    select refresh_token into v_refresh
      from public.calendar_connections
     where user_id = v_user and provider = 'google' and account_email = p_account_email;
  end if;
  if v_refresh is null then
    return 'no_refresh_token';
  end if;

  insert into public.calendar_connections (user_id, provider, account_email, access_token, refresh_token, expires_at, scope, updated_at)
  values (v_user, 'google', p_account_email, p_access_token, v_refresh, p_expires_at, p_scope, now())
  on conflict (user_id, provider, account_email) do update set
    access_token  = excluded.access_token,
    refresh_token = excluded.refresh_token,
    expires_at    = excluded.expires_at,
    scope         = excluded.scope,
    updated_at    = now();

  return 'ok';
end;
$$;

revoke all on function save_calendar_connection(text, text, text, text, bigint, text) from public, anon, authenticated;
grant execute on function save_calendar_connection(text, text, text, text, bigint, text) to anon;

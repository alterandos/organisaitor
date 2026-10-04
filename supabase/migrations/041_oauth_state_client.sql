-- Where an OAuth connect flow started, so the callback knows where to send the user back.
--
-- The Strava and Google Calendar callbacks (api/*-oauth-callback.ts) finish by redirecting to
-- the web app. A flow started from the Android app must instead return to the app through its
-- custom scheme (organisaitor://oauth-done, decision D5 in docs/android/10-gap-analysis.md).
-- The client says where it is when it mints the nonce; the callback learns it when it redeems
-- the nonce.
--
-- Additive only (docs/android/00-architecture.md ADR-9): the one-argument mint_oauth_state and
-- both save functions keep their signatures, and a web flow still gets 'ok' back exactly as
-- before, so code deployed before or after this runs keeps working. No new table, so no grant
-- beyond the new functions' own.

alter table oauth_states
  add column client text not null default 'web' check (client in ('web', 'android'));

-- Two-argument overload called by the Android app. The one-argument version from 032 stays as
-- it is (the column default records 'web').
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
  if p_provider not in ('strava', 'google') then
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

revoke all on function mint_oauth_state(text, text) from public, anon, authenticated;
grant execute on function mint_oauth_state(text, text) to authenticated;

-- Same as 032, except a successful save for a non-web flow returns 'ok:<client>' (e.g.
-- 'ok:android'). A web flow still returns plain 'ok'.
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
  v_user   uuid;
  v_client text;
begin
  delete from public.oauth_states
   where nonce = p_nonce and provider = 'strava' and expires_at > now()
  returning user_id, client into v_user, v_client;

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

  return case when v_client = 'web' then 'ok' else 'ok:' || v_client end;
end;
$$;

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
  v_client  text;
  v_refresh text := p_refresh_token;
begin
  delete from public.oauth_states
   where nonce = p_nonce and provider = 'google' and expires_at > now()
  returning user_id, client into v_user, v_client;

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

  return case when v_client = 'web' then 'ok' else 'ok:' || v_client end;
end;
$$;

-- Called by the callbacks when the provider reports an error (the user declined, say) before
-- anything is saved: consumes the nonce and returns the client it was minted for, or null if
-- it's unknown or expired. Knowing the nonce is what proves the caller started this flow, the
-- same as for the save functions.
create or replace function discard_oauth_state(p_nonce text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client text;
begin
  delete from public.oauth_states
   where nonce = p_nonce and expires_at > now()
  returning client into v_client;
  return v_client;
end;
$$;

revoke all on function discard_oauth_state(text) from public, anon, authenticated;
grant execute on function discard_oauth_state(text) to anon;

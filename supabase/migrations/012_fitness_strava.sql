-- Strava OAuth connection — one row per user. Tokens never reach the browser: only
-- api/strava-oauth-callback.ts (writes) and api/strava-sync.ts (reads) touch this table;
-- the client only ever calls api/strava-status.ts, which returns connection metadata,
-- never the tokens themselves.
create table fitness_strava_connection (
  user_id       uuid primary key references auth.users on delete cascade,
  athlete_id    bigint not null,
  access_token  text not null,
  refresh_token text not null,
  expires_at    bigint not null,  -- unix timestamp (seconds) — Strava's own format
  scope         text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table fitness_strava_connection enable row level security;
create policy "Users can read their own strava connection" on fitness_strava_connection for select using (auth.uid() = user_id);
create policy "Users can insert their own strava connection" on fitness_strava_connection for insert with check (auth.uid() = user_id);
create policy "Users can update their own strava connection" on fitness_strava_connection for update using (auth.uid() = user_id);
create policy "Users can delete their own strava connection" on fitness_strava_connection for delete using (auth.uid() = user_id);

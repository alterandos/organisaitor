-- External calendar sync (Google, Phase 1 — read-only ingest, one-way, this app becomes
-- the source of truth once an event is pulled in). See CLAUDE.md "External calendar sync".

-- One row per connected external account. Multiple connections are supported (e.g. two
-- Google accounts) — `id` is a real primary key, not `user_id`, unlike
-- fitness_strava_connection (which only ever needs one row per user). Tokens never reach
-- the browser: only api/google-calendar-*.ts touch access_token/refresh_token; the client
-- only ever calls api/google-calendar-status.ts, which returns connection metadata, never
-- the tokens themselves.
create table calendar_connections (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users on delete cascade,
  provider          text not null,                    -- 'google' (future: 'microsoft')
  account_email     text not null,
  access_token      text not null,
  refresh_token     text not null,
  expires_at        bigint not null,                   -- unix seconds
  scope             text not null,
  calendars_enabled jsonb not null default '[]',       -- string[] of provider calendar ids opted into syncing
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, provider, account_email)
);

alter table calendar_connections enable row level security;
create policy "Users can read their own calendar connections" on calendar_connections for select using (auth.uid() = user_id);
create policy "Users can insert their own calendar connections" on calendar_connections for insert with check (auth.uid() = user_id);
create policy "Users can update their own calendar connections" on calendar_connections for update using (auth.uid() = user_id);
create policy "Users can delete their own calendar connections" on calendar_connections for delete using (auth.uid() = user_id);

-- Sync provenance on calendar_events — all null for a native event. No foreign key from
-- source_connection_id to calendar_connections.id, matching this schema's established
-- convention of cross-entity id columns staying untyped text with no FK (e.g.
-- collections.collection_id, list_items.list_id).
alter table calendar_events
  add column source text,
  add column source_connection_id text,
  add column source_calendar_id text,
  add column source_event_id text,
  add column source_raw jsonb;

-- ================================================================
-- Migration 003 — tracker entries
-- Run in the Supabase SQL Editor after 001_initial.sql
-- ================================================================

-- ── Add field_schema column to collections ───────────────────────
alter table collections
  add column if not exists field_schema jsonb not null default '[]'::jsonb;

-- ── Tracker entries ──────────────────────────────────────────────
create table if not exists tracker_entries (
  id          text  primary key,
  user_id     uuid  not null references auth.users(id) on delete cascade,
  tracker_id  text  not null,   -- references collections(id)
  date        text  not null,   -- YYYY-MM-DD
  data        jsonb not null default '{}'::jsonb,
  notes       text,
  created_at  text  not null,
  updated_at  text  not null
);

alter table tracker_entries enable row level security;
create policy "users_own_tracker_entries" on tracker_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on tracker_entries to authenticated;

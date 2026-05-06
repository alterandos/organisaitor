-- ================================================================
-- My To Do / Life Organiser — initial schema
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor)
-- ================================================================

-- ── Tasks ───────────────────────────────────────────────────────
create table if not exists tasks (
  id             text        primary key,
  user_id        uuid        not null references auth.users(id) on delete cascade,
  title          text        not null,
  notes          text,
  links          text[]      not null default '{}',
  completed      boolean     not null default false,
  completed_at   text,
  collection_id  text,
  tag_ids        text[]      not null default '{}',
  purpose_ids    text[]      not null default '{}',
  priority       text        not null default 'none',
  deadline       text,
  deadline_time  text,
  remind_at      text,
  archived       boolean     not null default false,
  kind           text        not null default 'action',
  time_intensity text,
  parent_id      text,
  subtask_ids    text[]      not null default '{}',
  sort_order     integer     not null default 0,
  created_at     text        not null,
  updated_at     text        not null
);
alter table tasks enable row level security;
create policy "users_own_tasks" on tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Collections (projects, lists, trackers) ─────────────────────
create table if not exists collections (
  id           text    primary key,
  user_id      uuid    not null references auth.users(id) on delete cascade,
  kind         text    not null default 'project',
  name         text    not null,
  description  text,
  color        text,
  purpose_ids  text[]  not null default '{}',
  deadline     text,
  completed    boolean not null default false,
  completed_at text,
  created_at   text    not null,
  updated_at   text    not null
);
alter table collections enable row level security;
create policy "users_own_collections" on collections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Tags ────────────────────────────────────────────────────────
create table if not exists tags (
  id      text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name    text not null,
  color   text
);
alter table tags enable row level security;
create policy "users_own_tags" on tags
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Purposes ────────────────────────────────────────────────────
create table if not exists purposes (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  color       text,
  created_at  text not null,
  updated_at  text not null
);
alter table purposes enable row level security;
create policy "users_own_purposes" on purposes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Calendar Events ─────────────────────────────────────────────
create table if not exists calendar_events (
  id                  text    primary key,
  user_id             uuid    not null references auth.users(id) on delete cascade,
  title               text    not null,
  date                text    not null,
  start_time          text,
  end_time            text,
  notes               text,
  location            text,
  event_type          text    not null default 'default',
  collection_id       text,
  notify_before_value integer not null default 1,
  notify_before_unit  text    not null default 'hours',
  remind_at           text,
  notify_at_time      text,
  repeat              jsonb,
  created_at          text    not null,
  updated_at          text    not null
);
alter table calendar_events enable row level security;
create policy "users_own_calendar_events" on calendar_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Calendar Reminders ──────────────────────────────────────────
create table if not exists calendar_reminders (
  id            text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  title         text not null,
  date          text not null,
  time          text,
  notes         text,
  collection_id text,
  remind_at     text,
  repeat        jsonb,
  created_at    text not null,
  updated_at    text not null
);
alter table calendar_reminders enable row level security;
create policy "users_own_calendar_reminders" on calendar_reminders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

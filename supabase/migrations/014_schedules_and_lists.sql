-- Schedules and Lists — first Supabase tables for these two features.
-- Both scheduleStore and listStore have been localStorage-only since they shipped;
-- this brings them onto the same sync pipeline as tasks/collections/calendar/tracker
-- (see src/services/sync/syncService.ts). Soft-delete (deleted_at) is included from
-- the start on every table here, matching the tombstone model 013_soft_delete.sql
-- introduced for the original tables — no separate follow-up migration needed later.
--
-- Cross-entity ID columns (collection_id, list_id, type_id, tab_id) are deliberately
-- plain `text`, not foreign keys — matches every other such column in this schema
-- (tasks.collection_id, calendar_events.collection_id, etc.), which never FK across
-- entity tables. Only user_id gets a real FK, to auth.users.
--
-- list_types: only NON-built-in (custom, user-created) types are ever written here.
-- Built-in types (fixed ids like 'lt-movies', isBuiltIn: true) are re-seeded locally
-- by listStore.ts on every load and are never uploaded — mirrors how Fitness's
-- BUILTIN_ACTIVITY_TYPE_SEEDS work, just extended to actually sync the custom ones.
-- ListType has no createdAt/updatedAt in the domain model (same as Tag), so this
-- table has no updated_at either — mergeRecords() falls back to remote-wins for it,
-- same tombstone-aware fallback already used for tags.

-- ── Schedules (recurring weekly timetables) ─────────────────────
create table if not exists schedules (
  id            text        primary key,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  name          text        not null,
  color         text,
  start_date    text,
  end_date      text,
  active        boolean     not null default true,
  collection_id text,
  blocks        jsonb       not null default '[]',
  created_at    text        not null,
  updated_at    text        not null,
  deleted_at    timestamptz
);
alter table schedules enable row level security;
create policy "users_own_schedules" on schedules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on schedules to authenticated;

-- ── Lists ────────────────────────────────────────────────────────
create table if not exists lists (
  id           text        primary key,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  name         text        not null,
  description  text,
  type_id      text,
  kind         text        not null default 'reference',
  color        text,
  icon         text,
  field_schema jsonb       not null default '[]',
  tabs         jsonb       not null default '[]',
  created_at   text        not null,
  updated_at   text        not null,
  deleted_at   timestamptz
);
alter table lists enable row level security;
create policy "users_own_lists" on lists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on lists to authenticated;

-- ── List items ───────────────────────────────────────────────────
create table if not exists list_items (
  id         text        primary key,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  list_id    text        not null,
  title      text        not null,
  status     text        not null default 'want',
  tab_id     text,
  data       jsonb       not null default '{}',
  notes      text,
  links      text[]      not null default '{}',
  sort_order integer     not null default 0,
  created_at text        not null,
  updated_at text        not null,
  deleted_at timestamptz
);
alter table list_items enable row level security;
create policy "users_own_list_items" on list_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on list_items to authenticated;

-- ── List types (custom only — see note above) ───────────────────
create table if not exists list_types (
  id             text        primary key,
  user_id        uuid        not null references auth.users(id) on delete cascade,
  name           text        not null,
  icon           text        not null,
  color          text,
  kind           text        not null,
  default_fields jsonb       not null default '[]',
  deleted_at     timestamptz
);
alter table list_types enable row level security;
create policy "users_own_list_types" on list_types
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on list_types to authenticated;

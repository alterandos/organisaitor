-- Types (2026-10-29, docs/features/endeavours.md phase 3): what kind of thing an item is (an Exam,
-- an Essay, a Reading), with fields to fill in, defaults and parts. Add-only: a new table, and two
-- columns on tasks, calendar events and deadlines that stay null on anything untyped. The app sends
-- the columns only once an item has a Type, so untyped items sync before this has run.
-- Fields, defaults and parts are one jsonb `definition`, so a new option never needs a migration.
-- Ids are random (nanoid), unique across accounts. A new table, so it grants itself (see 022).

create table if not exists item_types (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  icon        text,
  extends_id  text,
  definition  jsonb not null default '{}'::jsonb,
  archived_at text,
  created_at  text not null,
  updated_at  text not null,
  deleted_at  timestamptz
);

create index if not exists item_types_user_id_idx on item_types (user_id);

alter table item_types enable row level security;

create policy "users_own_item_types" on item_types
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on item_types to authenticated;

alter table tasks              add column if not exists type_id text;
alter table tasks              add column if not exists type_fields jsonb;
alter table calendar_events    add column if not exists type_id text;
alter table calendar_events    add column if not exists type_fields jsonb;
alter table calendar_deadlines add column if not exists type_id text;
alter table calendar_deadlines add column if not exists type_fields jsonb;

-- Suite-wide Recycling Bin — a snapshot of every deleted item, kept for restore.
--
-- This is deliberately a NEW, separate table, not a reuse of the deleted_at tombstone
-- columns the other synced tables already have (013/014/020/021). Those tombstones exist
-- purely as sync-internal plumbing — telling a second device "remove your local copy too" —
-- and are invisible in the UI. trash_items is the opposite: a user-facing record of what was
-- deleted, when, and by whom, independent of whether the source table even syncs (e.g. a
-- restored Fitness activity just goes back into fitnessStore, which has no Supabase sync at
-- all — trash_items doesn't need it to).
--
-- Column names deliberately avoid a collision: `original_deleted_at` is when the ORIGINAL
-- ENTITY was deleted (the domain fact); `deleted_at` is this row's own sync tombstone (set
-- only when a trash entry itself is forgotten — emptied from the bin, or restored), following
-- the same convention every other synced table uses.

create table if not exists trash_items (
  id                  text primary key,
  user_id             uuid not null references auth.users(id) on delete cascade,
  kind                text not null,
  source_app          text not null,
  source_section      text not null,
  title               text not null,
  context_line        text not null default '',
  snapshot            jsonb not null,
  original_deleted_at timestamptz not null,
  deleted_by          jsonb not null default '{"type":"user"}',
  created_at          text not null,
  updated_at          text not null,
  deleted_at          timestamptz
);

alter table trash_items enable row level security;

create policy "users_own_trash_items" on trash_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on trash_items to authenticated;

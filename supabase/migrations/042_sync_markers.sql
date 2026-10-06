-- Restore marker (2026-10-06): one row per account recording when a backup was last restored.
-- A device that loads after a restore it hasn't seen treats the cloud as the truth for that load:
-- its local copies and queued changes OLDER than restored_at give way to the restored data, while
-- anything edited after the restore still wins normally. See syncService.ts "Restore marker".
-- New table, so it grants to authenticated itself (see 022).

create table if not exists sync_markers (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  restored_at timestamptz not null
);

alter table sync_markers enable row level security;

create policy "users_own_sync_markers" on sync_markers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on sync_markers to authenticated;

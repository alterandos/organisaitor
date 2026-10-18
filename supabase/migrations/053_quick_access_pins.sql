-- Quick Access pins (2026-10-18): what the person has pinned to Quick Access (Q), in their order.
--   id is `${type}:${entity_id}`, so an item is pinned once however many devices pin it. Places
--   ('place:review') have the same id in every account, so the key is (user_id, id), as for
--   investment_purposes (050); the app upserts on those two columns (syncService.ts, TABLE_DEFS).
-- New table, so it grants to authenticated itself (see 022).

create table if not exists quick_access_pins (
  id          text not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null,
  entity_id   text not null,
  sort_order  integer not null default 0,
  created_at  text not null,
  updated_at  text not null,
  deleted_at  timestamptz,
  primary key (user_id, id)
);

alter table quick_access_pins enable row level security;

create policy "users_own_quick_access_pins" on quick_access_pins
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on quick_access_pins to authenticated;

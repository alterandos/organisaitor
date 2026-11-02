-- Quick Access visits (2026-11-02): Go to's Recent and Frequent history, so it follows the person
-- across devices and survives signing out (it was this device's localStorage only, wiped on sign-out).
--   id is `${type}:${entity_id}`, the same on every device; places ('place:settings') have the same
--   id in every account, so the key is (user_id, id), as for quick_access_pins (053).
--   visits: when the last 20 counted visits were (ISO strings), joined across devices by the app.
-- New table, so it grants to authenticated itself (see 022).

create table if not exists quick_access_visits (
  id               text not null,
  user_id          uuid not null references auth.users(id) on delete cascade,
  type             text not null,
  entity_id        text not null,
  last_visited_at  text not null,
  visit_count      integer not null default 0,
  visits           jsonb not null default '[]'::jsonb,
  updated_at       text not null,
  deleted_at       timestamptz,
  primary key (user_id, id)
);

alter table quick_access_visits enable row level security;

create policy "users_own_quick_access_visits" on quick_access_visits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on quick_access_visits to authenticated;

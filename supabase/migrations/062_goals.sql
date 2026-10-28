-- Goals (2026-10-29, docs/features/endeavours.md phase 5): a result wanted from an Endeavour,
-- measured by hand, by keeping up a rhythm, from a tracker, or by its tasks. Add-only: a new table.
-- Its target is a typed reference (jsonb), so a goal on a Purpose can come later with no migration;
-- its measure and check-ins are jsonb too, so a new kind of measure never needs one either.
-- Ids are random (nanoid), unique across accounts. A new table, so it grants itself (see 022).
-- Safe to run again.

create table if not exists goals (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  target      jsonb not null,
  by_date     text,
  measure     jsonb not null,
  check_ins   jsonb not null default '[]'::jsonb,
  status      text not null default 'active',
  status_at   text,
  created_at  text not null,
  updated_at  text not null,
  deleted_at  timestamptz
);

create index if not exists goals_user_id_idx on goals (user_id);

alter table goals enable row level security;

drop policy if exists "users_own_goals" on goals;
create policy "users_own_goals" on goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on goals to authenticated;

-- Tell the API about the new table straight away.
notify pgrst, 'reload schema';

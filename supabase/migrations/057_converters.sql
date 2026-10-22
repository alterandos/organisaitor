-- Custom converters (2026-10-23): the person's own converters (components/ConverterPane), synced
-- so they follow the account. Inputs, output and formulas are one jsonb `definition`, so a new
-- converter option never needs a migration. Ids are random (nanoid), unique across accounts.
-- A new table, so it grants to authenticated itself (see 022).

create table if not exists converters (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  icon        text,
  definition  jsonb not null default '{}'::jsonb,
  created_at  text not null,
  updated_at  text not null,
  deleted_at  timestamptz
);

create index if not exists converters_user_id_idx on converters (user_id);

alter table converters enable row level security;

create policy "users_own_converters" on converters
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on converters to authenticated;

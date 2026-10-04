-- Overview (2026-10-01): the suite-level "everything like this, from every app" section.
--   lists.collection_id — a list's Endeavour (items inherit it), so lists take part in an
--                         Endeavour's Overview. Plaintext even on an encrypted list, like
--                         notes.collection_id.
--   overviews           — saved (custom) Overviews: a name, an icon and the query as one jsonb
--                         blob (sources, Endeavour, status, dates, search, sort, grouping), so a new
--                         query option never needs a migration. The rows themselves are computed
--                         in the app; nothing else is stored.
-- New table, so it grants to authenticated itself (see 022).

alter table lists add column if not exists collection_id text;

create table if not exists overviews (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  icon        text,
  definition  jsonb not null default '{}',
  created_at  text not null,
  updated_at  text not null,
  deleted_at  timestamptz
);

alter table overviews enable row level security;

create policy "users_own_overviews" on overviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on overviews to authenticated;

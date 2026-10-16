-- Picture library (2026-10-17): each picture stored once and referred to by id (services/pictures.ts).
--   pictures            — a compressed data URL in `src`; an encrypted picture (used by an encrypted
--                         note) has `src` blank and the data URL inside `encrypted_payload`, like an
--                         encrypted note. `copy_of`: the plain picture an encrypted copy was made from.
--   notes.backdrop      — a note's own backdrop (null = as its notebook): {kind:'plain'|'preset'|'picture', …}.
--   note_tags.backdrop  — a notebook's, passed down to its notes and sub-notebooks.
-- New table, so it grants to authenticated itself (see 022).

alter table notes add column if not exists backdrop jsonb;
alter table note_tags add column if not exists backdrop jsonb;

create table if not exists pictures (
  id                text primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,
  src               text not null default '',
  is_encrypted      boolean not null default false,
  encrypted_payload text,
  copy_of           text,
  created_at        text not null,
  updated_at        text not null,
  deleted_at        timestamptz
);

alter table pictures enable row level security;

create policy "users_own_pictures" on pictures
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on pictures to authenticated;

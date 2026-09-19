-- Wires Notes into the same sync pipeline as every other app (see CLAUDE.md
-- "Notes/Portfolio/Fitness Supabase sync"). notes/note_tags already existed from
-- 008_notes_initial.sql (reserved early, never wired into syncService.ts) but are
-- missing every field added to the domain model since — this catches them up rather
-- than recreating. structured_tag_entries didn't exist at all (that feature shipped
-- after 008).

alter table notes add column if not exists abstract text;
alter table notes add column if not exists parent_id text;
alter table notes add column if not exists tabs jsonb not null default '[]';
alter table notes add column if not exists main_tab_name text not null default 'Main';
alter table notes add column if not exists tab_order jsonb not null default '[]';
alter table notes add column if not exists template_id text;
alter table notes add column if not exists collection_id text;
alter table notes add column if not exists tag_data jsonb not null default '{}';
-- When true, `content` holds a JSON envelope ({iv, ciphertext}, both base64) produced
-- by src/services/vault.ts's encryptField() instead of the raw Tiptap doc JSON — see
-- BACKLOG.md "Client-side encryption for sensitive content". Encryption/decryption is
-- purely a NoteEditor-level (read/write boundary) concern; the sync pipeline and this
-- column both just move an opaque string, no crypto awareness needed here or in
-- syncService.ts/mappers.ts.
alter table notes add column if not exists is_encrypted boolean not null default false;
alter table notes add column if not exists deleted_at timestamptz;

alter table note_tags add column if not exists kind text not null default 'area';
alter table note_tags add column if not exists field_schema jsonb not null default '[]';
alter table note_tags add column if not exists preset_key text;
alter table note_tags add column if not exists collection_id text;
alter table note_tags add column if not exists deleted_at timestamptz;

create table structured_tag_entries (
  id            text primary key,
  user_id       uuid not null references auth.users on delete cascade,
  type_key      text not null,
  tag_id        text not null,
  term          text not null,
  fields        jsonb not null default '{}',
  note_id       text not null,
  collection_id text,
  created_at    text not null,
  updated_at    text not null,
  deleted_at    timestamptz
);

alter table structured_tag_entries enable row level security;
create policy "Users can read their own structured tag entries" on structured_tag_entries for select using (auth.uid() = user_id);
create policy "Users can create structured tag entries" on structured_tag_entries for insert with check (auth.uid() = user_id);
create policy "Users can update their own structured tag entries" on structured_tag_entries for update using (auth.uid() = user_id);
create policy "Users can delete their own structured tag entries" on structured_tag_entries for delete using (auth.uid() = user_id);

create index if not exists structured_tag_entries_user_id_idx on structured_tag_entries(user_id);
create index if not exists structured_tag_entries_note_id_idx on structured_tag_entries(note_id);

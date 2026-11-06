-- The person's own Endeavour templates (2026-11-05, docs/features/endeavours.md "Saved templates"):
-- made from scratch or saved from an Endeavour, and their copies of the built-in ones. The template
-- itself (dates, details, classes, tasks, lists, goals…) is one jsonb `definition`, so a new part
-- never needs a migration. Ids are random (nanoid), unique across accounts. A new table, so it
-- grants itself (see 022). Safe to run again.

create table if not exists endeavour_templates (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  icon        text,
  built_in    text,
  definition  jsonb not null default '{}'::jsonb,
  created_at  text not null,
  updated_at  text not null,
  deleted_at  timestamptz
);

create index if not exists endeavour_templates_user_id_idx on endeavour_templates (user_id);

alter table endeavour_templates enable row level security;

drop policy if exists "users_own_endeavour_templates" on endeavour_templates;
create policy "users_own_endeavour_templates" on endeavour_templates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on endeavour_templates to authenticated;

notify pgrst, 'reload schema';

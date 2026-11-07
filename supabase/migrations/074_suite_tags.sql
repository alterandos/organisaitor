-- One set of tags for the suite (2026-11-06, docs/features/endeavours.md "Tags across the suite").
-- A tag gains an icon, an archive date and timestamps (so sync can tell which copy is newer). The
-- suite's tags go on calendar events, reminders and deadlines and on lists (`tag_ids`), and on
-- notes and notebooks (`suite_tag_ids`, since their `tag_ids` are a note's notebooks). An Endeavour
-- gains an icon. Every new column is nullable: the app sends the item columns only once set, so a
-- batch upsert's null for other rows reads as "none". No new table, so no grant. Safe to run again.

alter table tags add column if not exists icon text;
alter table tags add column if not exists archived_at timestamptz;
alter table tags add column if not exists created_at timestamptz;
alter table tags add column if not exists updated_at timestamptz;

alter table calendar_events    add column if not exists tag_ids jsonb;
alter table calendar_reminders add column if not exists tag_ids jsonb;
alter table calendar_deadlines add column if not exists tag_ids jsonb;
alter table lists              add column if not exists tag_ids jsonb;
alter table notes              add column if not exists suite_tag_ids jsonb;
alter table note_tags          add column if not exists suite_tag_ids jsonb;

alter table collections add column if not exists icon text;

notify pgrst, 'reload schema';

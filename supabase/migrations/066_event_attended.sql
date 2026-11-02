-- The dates of an event the person went to (2026-10-30, docs/features/endeavours.md phase 7 (e)):
-- a class's "attended" marks, so an unmarked past class shows as not attended. Add-only:
-- `attended_dates jsonb` on calendar_events, null until the first is marked. The app sends it only
-- once set, and it's nullable, so a batch upsert's null for other rows is "none". No new table, so
-- no grant. Safe to run again.

alter table calendar_events add column if not exists attended_dates jsonb;

notify pgrst, 'reload schema';

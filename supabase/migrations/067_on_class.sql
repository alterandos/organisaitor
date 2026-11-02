-- An item in a class's time, shown instead of it or during it (2026-10-30, docs/features/
-- endeavours.md phase 7): `on_class jsonb` ({ eventId, date, mode: 'replaces' | 'during' }) on
-- calendar_events and calendar_deadlines, null when it simply clashes. Add-only. The app sends it only
-- once set, and it's nullable, so a batch upsert's null for other rows is "none". No new table, so
-- no grant. Safe to run again.

alter table calendar_events add column if not exists on_class jsonb;
alter table calendar_deadlines add column if not exists on_class jsonb;

notify pgrst, 'reload schema';

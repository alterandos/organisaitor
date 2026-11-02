-- Schedules rebuilt on calendar repeats (2026-10-30, docs/features/endeavours.md phase 7): a
-- Schedule's items are calendar events that name it (`schedule_id` on calendar_events), and a
-- Schedule can have its own breaks (`breaks jsonb` on schedules). Add-only and nullable: the app
-- sends each only once set, so everything else syncs before this has run. The old blocks column
-- stays (a converted Schedule's is []). No new table, so no grant. Safe to run again.

alter table calendar_events add column if not exists schedule_id text;
alter table schedules       add column if not exists breaks jsonb;

notify pgrst, 'reload schema';

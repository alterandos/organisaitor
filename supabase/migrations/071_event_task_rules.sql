-- Tasks for each date of an event (2026-11-04): a calendar event's task rules ("Prepare · 1 day
-- before each lecture"), from which one watcher makes a task a week before each is due
-- (services/eventTaskRules.ts). `task_rules jsonb` on calendar_events, nullable: the app sends it
-- only once an event has had rules, so a batch upsert's null for other rows reads as "none". The
-- tasks themselves are ordinary tasks; which date and rule made each is in their item_links, which
-- already exists. No new table, so no grant. Safe to run again.

alter table calendar_events add column if not exists task_rules jsonb;

notify pgrst, 'reload schema';

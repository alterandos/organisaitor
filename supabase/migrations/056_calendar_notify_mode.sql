-- One notify setting for every calendar item (2026-10-22): "N minutes / hours / days before" its
-- time, "N days before, at a time", or (a timed reminder) "at its time". Events already store an
-- amount and unit; reminders and deadlines gain them, and all three a mode saying which applies.
-- Existing rows keep what they did: events 'before' (their amount and unit), reminders and
-- deadlines 'daysAt' (their days before and time), except a timed reminder, which notified at
-- its time and is set to 'atTime' below. No new table, so no grant.

alter table calendar_events    add column if not exists notify_mode text not null default 'before';

alter table calendar_reminders add column if not exists notify_mode text not null default 'daysAt';
alter table calendar_reminders add column if not exists notify_before_value integer;
alter table calendar_reminders add column if not exists notify_before_unit text not null default 'hours';

alter table calendar_deadlines add column if not exists notify_mode text not null default 'daysAt';
alter table calendar_deadlines add column if not exists notify_before_value integer;
alter table calendar_deadlines add column if not exists notify_before_unit text not null default 'hours';

update calendar_reminders set notify_mode = 'atTime' where time is not null and notify_mode = 'daysAt';

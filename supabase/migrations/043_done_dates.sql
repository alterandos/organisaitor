-- Reminder/Deadline "done" (2026-10-06, docs/android/05-notifications.md N4): the occurrence dates
-- (YYYY-MM-DD) marked done. A done occurrence is struck through on the calendar and no longer
-- notifies. Per occurrence, so a repeating reminder can be done this week and not next.
-- Alters existing tables only, so no new grant.

alter table calendar_reminders add column if not exists done_dates jsonb not null default '[]';
alter table calendar_deadlines add column if not exists done_dates jsonb not null default '[]';

-- Notification actions, re-specced with the user (2026-10-06):
--   remind_occurrence — which occurrence a snooze (remind_at) is for, so snoozing one date of a
--                       repeating item re-notifies that date only (it used to stand for the series'
--                       first date, and silenced every date up to the snooze).
--   seen_dates        — occurrences whose notification was acknowledged ("Got it", or ✕ on the
--                       card), synced so no device notifies them again. Events and deadlines only:
--                       a reminder's "Got it" marks it done (done_dates, 043).
-- Alters existing tables only, so no new grant.

alter table calendar_events    add column if not exists remind_occurrence text;
alter table calendar_events    add column if not exists seen_dates jsonb not null default '[]';
alter table calendar_reminders add column if not exists remind_occurrence text;
alter table calendar_deadlines add column if not exists remind_occurrence text;
alter table calendar_deadlines add column if not exists seen_dates jsonb not null default '[]';

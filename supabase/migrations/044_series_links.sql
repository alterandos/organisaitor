-- A date taken out of a repeating series keeps its link back (2026-10-06): "Edit only this one" and
-- "Edit this and following" used to make a standalone copy with no record of where it came from.
-- Now the copy names its series (series_id) and the occurrence it stands in for (series_date,
-- YYYY-MM-DD) — iCalendar's RECURRENCE-ID / Google's recurringEventId + originalStartTime.
-- Both null for anything else, or once the user unlinks it.
-- Alters existing tables only, so no new grant.

alter table calendar_events    add column if not exists series_id text;
alter table calendar_events    add column if not exists series_date text;
alter table calendar_reminders add column if not exists series_id text;
alter table calendar_reminders add column if not exists series_date text;
alter table calendar_deadlines add column if not exists series_id text;
alter table calendar_deadlines add column if not exists series_date text;

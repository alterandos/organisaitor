-- Reminders and deadlines can be set not to notify (2026-10-19): the Notify checkbox in the new
-- calendar item modal and the reminder/deadline panes. true for every existing row, which is
-- what they did before. No new table, so no grant.

alter table calendar_reminders add column if not exists notify boolean not null default true;
alter table calendar_deadlines add column if not exists notify boolean not null default true;

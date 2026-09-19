-- Calendar events and reminders can be archived (sunset, not deleted), same as tasks (028):
-- hidden from the calendar but kept, with an optional reason, and restorable.
--
-- Alters existing tables only, so no new grant is needed (001/002 already cover both).
-- RUN THIS BEFORE using the updated app: every event/reminder upsert now sends `archived_at`
-- and `archive_reason`, so both tables reject writes until it's applied.

alter table calendar_events    add column if not exists archived_at    timestamptz;
alter table calendar_events    add column if not exists archive_reason text;

alter table calendar_reminders add column if not exists archived_at    timestamptz;
alter table calendar_reminders add column if not exists archive_reason text;

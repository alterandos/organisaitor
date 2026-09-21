-- Calendar events and reminders get a links list, same as tasks (tasks.links is text[] since 001).
-- Links typed into an item's notes are copied into it by the app.
--
-- Alters existing tables only, so no new grant is needed (001/002 already cover both).
-- RUN THIS BEFORE using the updated app: every event/reminder upsert now sends `links`, so both
-- tables reject writes until it's applied.

alter table calendar_events    add column if not exists links text[] not null default '{}';
alter table calendar_reminders add column if not exists links text[] not null default '{}';

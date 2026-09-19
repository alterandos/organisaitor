-- Task archiving gets a timestamp and an optional reason (the `archived` boolean has existed
-- since 001). Archived tasks are hidden from the list/calendar but kept, and can be restored.
--
-- Alters an existing table only, so no new grant is needed (001/002 already cover `tasks`).
-- RUN THIS BEFORE using the updated app: every task upsert now sends `archived_at` and
-- `archive_reason`, so the tasks table rejects writes until it's applied.

alter table tasks add column if not exists archived_at    timestamptz;
alter table tasks add column if not exists archive_reason text;

-- Tasks archived before this migration (e.g. via a notification's Archive button) have no
-- timestamp; use their last update as the best available approximation.
update tasks set archived_at = updated_at where archived = true and archived_at is null;

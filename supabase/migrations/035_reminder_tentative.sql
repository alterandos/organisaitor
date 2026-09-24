-- Reminders get the same 'confirmed' | 'tentative' status column Events already have
-- (017_event_status.sql), reopening what was previously a deliberate Events-only scope
-- decision (see CLAUDE.md "Tentative events") at the user's request 2026-09-24.
--
-- Alters an existing table only, so no new grant is needed (001/002 already cover it).

alter table calendar_reminders add column if not exists status text not null default 'confirmed';

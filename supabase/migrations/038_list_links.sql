-- Lists join cross-app linking (2026-09-28, "Lists: links from tasks, calendar items and notes").
--   cross_app_refs          — the list's own links to notes (same shape as tasks.cross_app_refs).
--                             Links FROM a task/event/reminder/deadline TO a list live on that
--                             item's existing cross_app_refs column, so those tables don't change.
--   reset_on_task_complete  — checklists: untick every item when a linked task is completed.
-- Alters an existing table only, so no new grant is needed.

alter table lists add column if not exists cross_app_refs jsonb not null default '[]';
alter table lists add column if not exists reset_on_task_complete boolean not null default false;

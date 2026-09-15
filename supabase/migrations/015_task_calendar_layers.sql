-- Task deadlines become real, syncable calendar entities — mirrors the existing
-- scheduledAt -> shadow CalendarEvent pattern, but for deadline -> shadow CalendarReminder.
-- Both shadow-entity kinds are now distinguishable from user-created ones via a type
-- column, which drives the calendar's layer-toggle filter (see CLAUDE.md "Task Calendar
-- Items — layers").
--
-- calendar_events.event_type already exists (001_initial.sql) as a free-text column with
-- no CHECK constraint, so the new 'task' value needs no schema change here — it's purely
-- an added TS union member (CalendarEventType) set when a scheduled task's shadow event
-- is created.
--
-- calendar_reminders gets the equivalent new column, reminder_type, for exactly the same
-- reason: a task's deadline now creates a real calendar_reminders row (task.calendar_reminder_id
-- points at it), and reminder_type='task' both drives the layer filter and lets the app
-- exclude these rows from the plain reminders render pass (the deadline still renders as
-- its own dedicated pill, synthesized directly from the task — see CalendarReminderType
-- in src/types/index.ts).

alter table tasks
  add column if not exists calendar_reminder_id text;

alter table calendar_reminders
  add column if not exists reminder_type text not null default 'default';

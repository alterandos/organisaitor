-- Calendar: "important" flag on events and reminders (red outline + ❗ on the calendar), and
-- "notify before" becoming opt-in on events (CalendarEvent.notifyBeforeValue: number | null —
-- null means no notification). Existing rows keep their current integer value, so every event
-- that was notifying before still does.
alter table calendar_events
  add column if not exists important boolean not null default false;

alter table calendar_events
  alter column notify_before_value drop not null;

alter table calendar_reminders
  add column if not exists important boolean not null default false;

-- Reverse cross-app links (e.g. the note an event/reminder was created from) — see CLAUDE.md
-- "Cross-app linking". Same shape as tasks.cross_app_refs (016).
alter table calendar_events
  add column if not exists cross_app_refs jsonb not null default '[]';

alter table calendar_reminders
  add column if not exists cross_app_refs jsonb not null default '[]';

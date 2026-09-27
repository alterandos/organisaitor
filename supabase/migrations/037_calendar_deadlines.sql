-- New "Deadline" calendar kind (decided 2026-09-27, see CLAUDE.md "Deadline calendar kind" and
-- docs/features/implemented-features.md) — a genuinely new entity, not a CalendarReminder
-- variant, even though its shape is deliberately close to calendar_reminders (same repeat/
-- tentative/important/notify-lead-time machinery). Includes every column calendar_reminders
-- has accumulated across migrations 001/004(links)/006/009/011/025/026/028/035, since this
-- table starts from the current shape rather than growing incrementally.
create table if not exists calendar_deadlines (
  id                text        primary key,
  user_id           uuid        not null references auth.users(id) on delete cascade,
  title             text        not null,
  date              text        not null,
  time              text,
  notes             text,
  links             text[]      not null default '{}',
  collection_id     text,
  deadline_type     text        not null default 'default',
  remind_at         text,
  repeat            jsonb,
  important         boolean     not null default false,
  status            text        not null default 'confirmed',
  notify_days_before integer    not null default 1,
  notify_at_time    text        not null default '17:00',
  cross_app_refs    jsonb       not null default '[]',
  archived_at       timestamptz,
  archive_reason    text,
  created_at        text        not null,
  updated_at        text        not null,
  deleted_at        timestamptz
);
alter table calendar_deadlines enable row level security;
create policy "users_own_calendar_deadlines" on calendar_deadlines
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on calendar_deadlines to authenticated;

-- Task.calendarDeadlineId — the task-deadline shadow now links to a Deadline instead of a
-- Reminder (Task.calendarReminderId is kept on the type/table for any not-yet-migrated data,
-- see services/taskDeadlineMigration.ts, but is expected null for every task going forward).
alter table tasks add column if not exists calendar_deadline_id text;

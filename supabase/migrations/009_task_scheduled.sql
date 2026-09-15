-- Add scheduled date fields to tasks
alter table tasks
  add column if not exists scheduled_at      text,
  add column if not exists scheduled_time    text,
  add column if not exists calendar_event_id text;

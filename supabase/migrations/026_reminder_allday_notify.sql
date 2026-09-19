-- Whole-day reminders (no time) now carry their own notification moment: N days before the date
-- (0 = on the day), at a time of day. Defaults to the evening before, so every existing row gets
-- a sensible value. Ignored for reminders that have a time. See CLAUDE.md "Calendar: whole-day
-- reminder notifications". Alters an existing table only, so no new grants needed.
alter table calendar_reminders
  add column if not exists notify_days_before integer not null default 1,
  add column if not exists notify_at_time text not null default '17:00';

-- Recurring tasks (2026-10-07): a task's repeat rule (the same RepeatConfig shape calendar items
-- use: freq, interval, endKind, count, until). Completing a repeating task creates the next
-- occurrence (services/recurringTasks.ts); null = doesn't repeat.
-- Alters an existing table only, so no new grant.
alter table tasks add column if not exists repeat jsonb;

-- "Background / banner calendar events" (e.g. "Thailand for 10 days") — a multi-day
-- CalendarEvent flagged to render as a thin line near the top of its covered days instead of a
-- normal coloured pill, rather than a new entity type (decided 2026-09-27). `color` is an
-- explicit per-event colour override for that rendering (added same day, before this migration
-- was ever run) — takes priority over the Endeavour's own colour.
--
-- Alters an existing table only, so no new grant is needed (001/002 already cover it).

alter table calendar_events add column if not exists background boolean not null default false;
alter table calendar_events add column if not exists color text;

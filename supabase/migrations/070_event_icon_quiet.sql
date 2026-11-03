-- An event's icon (shown before its title) and Show quieter (drawn lighter, a journey), 2026-11-03:
-- the event's own type field (birthday, travel) was retired for Types, which preset both. `icon text`
-- and `quiet boolean` on calendar_events, both nullable: the app sends them only once set, so a
-- batch upsert's null for other rows reads as "none". No new table, so no grant. Safe to run again.

alter table calendar_events add column if not exists icon text;
alter table calendar_events add column if not exists quiet boolean;

notify pgrst, 'reload schema';

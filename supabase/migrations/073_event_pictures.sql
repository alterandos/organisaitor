-- Pictures on a calendar event (2026-11-05): `picture_ids jsonb` on calendar_events, the ids of
-- pictures in the picture library (the `pictures` table, which already syncs). Nullable: the app
-- sends it only once an event has had pictures, so a batch upsert's null for other rows reads as
-- "none". No new table, so no grant. Safe to run again.

alter table calendar_events add column if not exists picture_ids jsonb;

notify pgrst, 'reload schema';

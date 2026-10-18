-- Calendar import rebuilt (2026-10-18): where an imported event came from, and how a journey travels.
--   calendar_events.travel_mode    — 'flight' | 'train' | 'bus' | 'car' | 'ferry' for a travel event; null otherwise.
--   calendar_events.source_account — the account an imported event came from (its email for Google,
--                                    the file name for an .ics import). Stable across reconnecting,
--                                    unlike source_connection_id.
--   calendar_events.source_uid     — the iCalendar UID, so the same meeting from two calendars (or a
--                                    later .ics import) is recognised as one event.
-- Alters an existing table only, so no new grant.
alter table calendar_events add column if not exists travel_mode    text;
alter table calendar_events add column if not exists source_account text;
alter table calendar_events add column if not exists source_uid     text;

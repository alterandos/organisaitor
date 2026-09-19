-- Table privileges for everything added by 008 (notes/note_tags/cross_app_links — reserved
-- early, never granted because nothing queried them until Notes sync), 019 (user_vault),
-- 020 (structured_tag_entries) and 021 (watchlist_items/portfolio_tags/investment_purposes).
--
-- Raw SQL does not auto-grant table permissions to the `authenticated` role (see the note in
-- 001_initial.sql / 002_grants.sql; 003 and 014 grant explicitly for the same reason).
-- RLS policies alone aren't enough — without the GRANT the API returns 403 "permission
-- denied for table X" before RLS is even evaluated. 019–021 originally omitted this;
-- confirmed 2026-09-19 when initial sync 403'd on all of them. Grants are idempotent, so this
-- is safe to run whether or not the tables were already granted. Run AFTER 019, 020, 021.

grant select, insert, update, delete on notes                  to authenticated;
grant select, insert, update, delete on note_tags              to authenticated;
grant select, insert, update, delete on cross_app_links        to authenticated;
grant select, insert, update, delete on structured_tag_entries to authenticated;
grant select, insert, update, delete on user_vault             to authenticated;
grant select, insert, update, delete on watchlist_items        to authenticated;
grant select, insert, update, delete on portfolio_tags         to authenticated;
grant select, insert, update, delete on investment_purposes    to authenticated;
-- Same omission in 012 / 018 (both are read/written by edge functions as the signed-in user).
grant select, insert, update, delete on fitness_strava_connection to authenticated;
grant select, insert, update, delete on calendar_connections      to authenticated;

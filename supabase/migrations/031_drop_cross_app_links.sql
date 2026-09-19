-- Drops the `cross_app_links` table (created in 008, granted in 022).
--
-- It was reserved early as the "single source of truth for cross-app linking" and was never read
-- or written by any code. Cross-app links were built a different way: `crossAppRefs` jsonb columns
-- embedded on the linked entities themselves (016 for tasks, 025 for calendar events/reminders)
-- plus an `ArtifactLinkMark` in the note's own content — see CLAUDE.md "Cross-app linking".
--
-- Nothing to migrate: no code has ever written to it, so it should hold no rows. Dropping the
-- table also drops its indexes, RLS policies and grants. Safe to run at any time; app code does
-- not reference it.

drop table if exists cross_app_links;

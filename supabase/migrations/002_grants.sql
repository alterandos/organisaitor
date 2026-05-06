-- ================================================================
-- Run this in the Supabase SQL editor if you created tables via
-- 001_initial.sql (raw SQL doesn't auto-grant table permissions).
-- ================================================================

grant select, insert, update, delete on tasks              to authenticated;
grant select, insert, update, delete on collections        to authenticated;
grant select, insert, update, delete on tags               to authenticated;
grant select, insert, update, delete on purposes           to authenticated;
grant select, insert, update, delete on calendar_events    to authenticated;
grant select, insert, update, delete on calendar_reminders to authenticated;

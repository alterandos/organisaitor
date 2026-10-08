-- 047: when a note's main tab last changed (its hover in the tab bar shows created / modified).
-- The extra tabs carry their own createdAt / updatedAt inside the existing `tabs` jsonb, so they
-- need no column. Alters an existing table only, so no new grant.
alter table notes add column if not exists main_tab_updated_at timestamptz;

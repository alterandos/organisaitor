-- Links between Endeavours (2026-10-28, docs/features/endeavours.md phase 1): "part of" (rolls up;
-- several parents allowed) and "related", as a list on each Endeavour, like a task's item_links.
-- Add-only. The app sends the column only once an Endeavour has had a link, so Endeavours without
-- links keep syncing before this runs; one with links is refused until it does (it stays queued).
-- No new table, so no grant.

alter table collections add column if not exists links jsonb;

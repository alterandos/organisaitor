-- Rhythms (2026-10-29, docs/features/endeavours.md phase 4): a routine's streams (what's done again
-- and again, each on its own rule) as `streams jsonb` on collections. Add-only: absent on any
-- routine never given streams (it's read as one stream), and the app sends the column only once a
-- routine has some, so everything else syncs before this has run. Ticks need no change: they are
-- tracker entries of the rhythm, as a routine's completions already were. No new table, so no grant.

alter table collections add column if not exists streams jsonb;

-- note_tags."order" was created as `int` in 008_notes_initial.sql, but the app deliberately
-- stores FRACTIONAL sibling orders: outdentNoteTag() sets `parent.order + 0.5`, and the
-- Chronicle tree's drag-and-drop picks the midpoint between two neighbours (see
-- computeInsertOrder in ChronicleView.tsx) instead of renumbering every sibling. Forcing an
-- integer made the first Notes force-upload fail with:
--   invalid input syntax for type integer: "0.5"
-- (found 2026-09-19). double precision holds these exactly enough — orders are only ever
-- compared/sorted, never summed — and existing integer values convert losslessly.
-- No new table, so no grant needed (022 already covers note_tags).

alter table note_tags alter column "order" type double precision;

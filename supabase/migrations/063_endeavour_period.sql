-- An Endeavour's period and breaks (2026-10-30, docs/features/endeavours.md phase 7): a semester's
-- teaching weeks and its mid-semester break, taken live by the subjects part of it. Add-only:
-- `period jsonb` on collections, null on any Endeavour without its own (it takes the one above's).
-- The app sends it only once set, and it's nullable, so a batch upsert's null for other rows is
-- "none". No new table, so no grant. Safe to run again.

alter table collections add column if not exists period jsonb;

notify pgrst, 'reload schema';

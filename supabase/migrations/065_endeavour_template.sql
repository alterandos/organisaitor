-- The template an Endeavour was made from (2026-10-30, docs/features/endeavours.md phase 7 (d)):
-- 'subject', 'semester', … so its Edit opens that template's editor. Add-only: `template_id text`
-- on collections, null on one made by hand. The app sends it only once set, and it's nullable, so
-- a batch upsert's null for other rows is "none". No new table, so no grant. Safe to run again.

alter table collections add column if not exists template_id text;

notify pgrst, 'reload schema';

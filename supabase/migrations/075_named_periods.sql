-- Named periods (2026-11-07, docs/features/endeavours.md "Named periods"). A period is a custom
-- detail ("Teaching", "Exams", "Mid-semester break", kept in collections.attributes, no change
-- there); which ones an Endeavour runs during and pauses during is `date_use` on collections, and a
-- Schedule's own choice is `period_use` on schedules. Both jsonb, nullable: the app sends them once
-- set, so a batch upsert's null for other rows reads as "as above". No new table, so no grant. Safe
-- to run again.

alter table collections add column if not exists date_use jsonb;
alter table schedules   add column if not exists period_use jsonb;

notify pgrst, 'reload schema';

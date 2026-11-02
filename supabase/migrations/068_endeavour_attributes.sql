-- An Endeavour's attributes (2026-10-30, docs/features/endeavours.md "Attributes and Types for
-- Endeavours"): `attributes jsonb` on collections ({ typeId, fields, values }: its Type, its own
-- fields, their values), null until first given. Add-only. The app sends it only once set, and it's
-- nullable, so a batch upsert's null for other rows is "none". A Type's "used for" and the default it
-- was copied from live in item_types.definition, so no change there. No new table, so no grant.
-- Safe to run again.

alter table collections add column if not exists attributes jsonb;

notify pgrst, 'reload schema';

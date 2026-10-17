-- Investment purposes keyed per account (2026-10-18).
--   The built-in purposes (SEED_PURPOSES in portfolioStore.ts) have the same fixed ids in every
--   account ('ip-growth', 'ip-dividend'…). With `id` alone as the primary key, the first account
--   to upload 'ip-growth' owns that row, and every other account's upload of its own 'ip-growth'
--   hits it and is refused by RLS (403, "new row violates row-level security policy (USING
--   expression)"). The key becomes (user_id, id), so each account has its own copy; the app
--   upserts on those two columns (syncService.ts, TABLE_DEFS onConflict).
-- Existing rows already satisfy the new key (ids were unique). Alters an existing table only, so
-- no new grant.
alter table investment_purposes drop constraint if exists investment_purposes_pkey;
alter table investment_purposes add primary key (user_id, id);

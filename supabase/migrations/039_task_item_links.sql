-- Task links (2026-10-01, "Task links: depends on / follow-up of / related").
--   item_links — the links this task owns to other tasks: [{ kind, targetType, targetId, reason,
--                createdAt }], kind ∈ 'dependsOn' | 'followUpOf' | 'related'. Stored on one side
--                only; the other side is derived in the app, so there is nothing to keep in step.
-- Every task upsert now sends this column, so `tasks` rejects writes until this runs (sync isolates
-- the failure per table; nothing else breaks).
-- Alters an existing table only, so no new grant is needed.

alter table tasks add column if not exists item_links jsonb not null default '[]';

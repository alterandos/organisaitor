-- Encryption by scope (2026-10-26): a notebook or an Endeavour can keep everything in it encrypted
-- (utils/encryptionScopes.ts, CLAUDE.md "Encryption by scope"). The setting itself is not secret;
-- the notes and lists it covers are encrypted on the device before they're sent.
-- The app sends this column only once the setting has been changed on a record, so syncing keeps
-- working before this has been run. Adds columns to existing tables, so no new grant is needed.

alter table note_tags   add column if not exists encrypt_contents boolean not null default false;
alter table collections add column if not exists encrypt_contents boolean not null default false;

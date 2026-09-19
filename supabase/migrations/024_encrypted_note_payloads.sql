-- Comprehensive note encryption: an encrypted note's sensitive fields (title, content,
-- abstract, extra tabs, tab names, tag attribute values) and an encrypted structured-tag
-- entry's `term`/`fields` now live inside ONE client-side AES-GCM envelope instead of only
-- `content`. See CLAUDE.md "Client-side encryption for Notes" / src/services/noteSecrets.ts.
--
-- While a row is encrypted, its plaintext columns hold blanks (title '' / content '' /
-- abstract null / tabs [] / tag_data {} / term '' / fields {}) — the real values exist only
-- inside `encrypted_payload`. Nothing about this migration is enforced server-side: the
-- server never sees a key, so it can't tell ciphertext from any other string.
--
-- No new table, so no grant needed (022 already covers notes / structured_tag_entries).
-- RUN THIS BEFORE using the updated app: every note/entry upsert now sends `encrypted_payload`
-- (and, for entries, `is_encrypted`), so those two tables will reject writes until it's applied.

alter table notes                  add column if not exists encrypted_payload text;

alter table structured_tag_entries add column if not exists is_encrypted boolean not null default false;
alter table structured_tag_entries add column if not exists encrypted_payload text;

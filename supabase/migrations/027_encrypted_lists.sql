-- Client-side encryption for Lists, mirroring Notes (see 024 and CLAUDE.md "Client-side
-- encryption"). An encrypted list's name/description/type/field schema/tabs, and each of its
-- items' title/data/notes/links, live inside ONE AES-GCM envelope (`encrypted_payload`); the
-- plaintext columns hold blanks while encrypted ('' / null / '[]' / '{}'). The server never
-- sees a key, so none of this is enforced server-side.
--
-- Still plaintext by design: kind, color, icon, status, tab_id, sort_order, timestamps.
--
-- No new table, so no grant needed (014 already grants lists / list_items).
-- RUN THIS BEFORE using the updated app: every list/list-item upsert now sends
-- `is_encrypted` + `encrypted_payload`, so those tables reject writes until it's applied.

alter table lists      add column if not exists is_encrypted boolean not null default false;
alter table lists      add column if not exists encrypted_payload text;

alter table list_items add column if not exists is_encrypted boolean not null default false;
alter table list_items add column if not exists encrypted_payload text;

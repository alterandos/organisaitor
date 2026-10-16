-- Picture library, extended (2026-10-17): pictures in note text and on Glossary cards move into it.
--   pictures.origin — where a picture was added: 'backdrop', 'note' (a note's text) or 'card' (a
--                     Glossary card). Only backdrop pictures are offered in the backdrop picker.
-- Alters an existing table only, so no new grant.
alter table pictures add column if not exists origin text not null default 'backdrop';

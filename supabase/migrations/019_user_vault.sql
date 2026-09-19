-- Client-side encryption vault. The raw vault key is generated client-side and never
-- leaves a device in usable form — only PBKDF2-wrapped ciphertext blobs are stored here.
-- Two independent wrappings of the SAME raw key (passphrase path + recovery-code path)
-- so either secret alone can unlock it; the passphrase is deliberately never derived
-- from the Supabase login password (that's verified server-side by Supabase itself, so
-- anything derived from it would be reconstructable by Supabase too — defeating the
-- point of protecting data from the project admin/operator). See BACKLOG.md
-- "Client-side encryption for sensitive content" for the full design discussion.
create table user_vault (
  user_id                 uuid primary key references auth.users on delete cascade,
  wrapped_key             text not null,  -- base64 AES-GCM ciphertext of the raw vault key (passphrase path)
  wrapped_key_iv          text not null,  -- base64 IV used for that wrapping
  salt                    text not null,  -- base64 PBKDF2 salt (passphrase path)
  recovery_wrapped_key    text not null,  -- base64 AES-GCM ciphertext of the same raw vault key (recovery-code path)
  recovery_wrapped_key_iv text not null,
  recovery_salt           text not null,
  kdf_iterations          int not null default 250000,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table user_vault enable row level security;
create policy "Users can read their own vault" on user_vault for select using (auth.uid() = user_id);
create policy "Users can create their own vault" on user_vault for insert with check (auth.uid() = user_id);
create policy "Users can update their own vault" on user_vault for update using (auth.uid() = user_id);
create policy "Users can delete their own vault" on user_vault for delete using (auth.uid() = user_id);

-- Create notes table
create table notes (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  content text not null,
  tag_ids jsonb default '[]',
  color text,
  pinned boolean default false,
  created_at text not null,
  updated_at text not null,
  last_viewed_at text,
  archived_at text
);

-- Create note_tags table (hierarchical)
create table note_tags (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  description text,
  parent_tag_id text references note_tags(id) on delete set null,
  tag_type_id text,
  color text,
  icon text,
  "order" int default 0,
  created_at text not null,
  updated_at text not null
);

-- Create cross_app_links table (source of truth for cross-app relationships)
create table cross_app_links (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  source_type text not null, -- 'note' | 'task' | 'event' | 'entry' | 'watchlist-item'
  source_id text not null,
  target_type text not null, -- 'note' | 'task' | 'event' | 'entry' | 'watchlist-item'
  target_id text not null,
  link_type text default 'related', -- 'related' | 'supports' | 'blocked-by' | 'references'
  created_at text not null
);

-- Create indexes for common queries
create index notes_user_id_idx on notes(user_id);
create index notes_archived_at_idx on notes(archived_at);
create index note_tags_user_id_idx on note_tags(user_id);
create index note_tags_parent_tag_id_idx on note_tags(parent_tag_id);
create index cross_app_links_user_id_idx on cross_app_links(user_id);
create index cross_app_links_source_idx on cross_app_links(source_type, source_id);
create index cross_app_links_target_idx on cross_app_links(target_type, target_id);

-- Enable RLS on notes
alter table notes enable row level security;
create policy "Users can read their own notes" on notes for select using (auth.uid() = user_id);
create policy "Users can create notes" on notes for insert with check (auth.uid() = user_id);
create policy "Users can update their own notes" on notes for update using (auth.uid() = user_id);
create policy "Users can delete their own notes" on notes for delete using (auth.uid() = user_id);

-- Enable RLS on note_tags
alter table note_tags enable row level security;
create policy "Users can read their own note_tags" on note_tags for select using (auth.uid() = user_id);
create policy "Users can create note_tags" on note_tags for insert with check (auth.uid() = user_id);
create policy "Users can update their own note_tags" on note_tags for update using (auth.uid() = user_id);
create policy "Users can delete their own note_tags" on note_tags for delete using (auth.uid() = user_id);

-- Enable RLS on cross_app_links
alter table cross_app_links enable row level security;
create policy "Users can read their own cross_app_links" on cross_app_links for select using (auth.uid() = user_id);
create policy "Users can create cross_app_links" on cross_app_links for insert with check (auth.uid() = user_id);
create policy "Users can delete their own cross_app_links" on cross_app_links for delete using (auth.uid() = user_id);

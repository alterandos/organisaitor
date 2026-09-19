-- Wires Portfolio into the same sync pipeline as every other app (see CLAUDE.md
-- "Portfolio Supabase sync"). portfolioStore.ts was localStorage-only since it shipped —
-- these three tables didn't exist at all before this migration.
--
-- portfolio_tags / investment_purposes mirror PortfolioTag / InvestmentPurpose, both of
-- which have no createdAt/updatedAt in the domain model (same as the app-wide `Tag`
-- entity) — mergeRecords()'s existing fallback for timestamp-less entities (remote wins,
-- still tombstone-aware) applies unchanged, no new handling needed in syncService.ts.
-- investment_purposes' built-in seed rows (SEED_PURPOSES in portfolioStore.ts, fixed ids
-- like 'ip-dividend') are NOT given the list_types/activity-types "never sync, always
-- re-seeded locally" treatment — unlike those, portfolioStore has no active re-seed-on-
-- every-load mechanism and never blocks editing/deleting a seed purpose, so they behave
-- as ordinary mutable data; their fixed ids just naturally deduplicate across devices via
-- the same upsert-by-id every other synced row already uses.
--
-- WatchlistColumn[] (portfolioStore's per-user column visibility/order config) is
-- deliberately NOT synced here — a cosmetic per-device table preference, not portfolio
-- data, matching this project's existing precedent of leaving UI-only preferences
-- (sortField/sortDir, etc.) out of a sync pass unless specifically asked for.

create table watchlist_items (
  id                     text primary key,
  user_id                uuid not null references auth.users on delete cascade,
  ticker                 text,
  name                   text not null,
  asset_class            text,
  sector                 text,
  exchange               text,
  market_cap_value       numeric,
  status                 text not null default 'watching',
  held_at                text,
  investment_purpose_ids jsonb not null default '[]',
  tag_ids                jsonb not null default '[]',
  links                  jsonb not null default '[]',
  notes                  text,
  date_added             text not null,
  created_at             text not null,
  updated_at             text not null,
  deleted_at             timestamptz
);

create table portfolio_tags (
  id         text primary key,
  user_id    uuid not null references auth.users on delete cascade,
  name       text not null,
  color      text,
  deleted_at timestamptz
);

create table investment_purposes (
  id         text primary key,
  user_id    uuid not null references auth.users on delete cascade,
  name       text not null,
  color      text,
  deleted_at timestamptz
);

alter table watchlist_items enable row level security;
create policy "Users can read their own watchlist items" on watchlist_items for select using (auth.uid() = user_id);
create policy "Users can create watchlist items" on watchlist_items for insert with check (auth.uid() = user_id);
create policy "Users can update their own watchlist items" on watchlist_items for update using (auth.uid() = user_id);
create policy "Users can delete their own watchlist items" on watchlist_items for delete using (auth.uid() = user_id);

alter table portfolio_tags enable row level security;
create policy "Users can read their own portfolio tags" on portfolio_tags for select using (auth.uid() = user_id);
create policy "Users can create portfolio tags" on portfolio_tags for insert with check (auth.uid() = user_id);
create policy "Users can update their own portfolio tags" on portfolio_tags for update using (auth.uid() = user_id);
create policy "Users can delete their own portfolio tags" on portfolio_tags for delete using (auth.uid() = user_id);

alter table investment_purposes enable row level security;
create policy "Users can read their own investment purposes" on investment_purposes for select using (auth.uid() = user_id);
create policy "Users can create investment purposes" on investment_purposes for insert with check (auth.uid() = user_id);
create policy "Users can update their own investment purposes" on investment_purposes for update using (auth.uid() = user_id);
create policy "Users can delete their own investment purposes" on investment_purposes for delete using (auth.uid() = user_id);

create index if not exists watchlist_items_user_id_idx on watchlist_items(user_id);
create index if not exists portfolio_tags_user_id_idx on portfolio_tags(user_id);
create index if not exists investment_purposes_user_id_idx on investment_purposes(user_id);

-- Fitness sync (2026-10-22): activities and custom activity types join the cloud copy, so they
-- follow the account (before this they stayed on the device and showed under the next account to
-- sign in there). Built-in activity types ('run', 'hike', …) are seeded on every device and never
-- uploaded, as built-in list types aren't. Plaintext (decided 2026-09-19).
--   A Strava activity's id is a hash of the account and the Strava activity id
--   (src/utils/fitnessIds.ts), so two devices that sync Strava make one row. Other ids are random.
--   Every id is unique across accounts, so the key is id alone.
-- New tables, so each grants to authenticated itself (see 022).

create table if not exists fitness_activities (
  id                    text primary key,
  user_id               uuid not null references auth.users(id) on delete cascade,
  type                  text not null,
  title                 text not null,
  started_at            text not null,
  timezone              text,
  distance_meters       double precision,
  moving_time_seconds   double precision,
  elapsed_time_seconds  double precision,
  average_speed_mps     double precision,
  data                  jsonb not null default '{}'::jsonb,
  notes                 text,
  purpose_ids           jsonb not null default '[]'::jsonb,
  source                text not null default 'manual',
  source_id             text,
  source_raw            jsonb,
  archived_at           text,
  created_at            text not null,
  updated_at            text not null,
  deleted_at            timestamptz
);

create index if not exists fitness_activities_user_id_idx on fitness_activities (user_id);

alter table fitness_activities enable row level security;

create policy "users_own_fitness_activities" on fitness_activities
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on fitness_activities to authenticated;

create table if not exists fitness_activity_types (
  id               text primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  name             text not null,
  icon             text not null,
  color            text,
  tracks_distance  boolean not null default true,
  field_schema     jsonb not null default '[]'::jsonb,
  archived_at      text,
  created_at       text not null,
  updated_at       text not null,
  deleted_at       timestamptz
);

create index if not exists fitness_activity_types_user_id_idx on fitness_activity_types (user_id);

alter table fitness_activity_types enable row level security;

create policy "users_own_fitness_activity_types" on fitness_activity_types
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on fitness_activity_types to authenticated;

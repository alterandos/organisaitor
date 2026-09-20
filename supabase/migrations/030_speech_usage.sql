-- Voice dictation usage metering (see CLAUDE.md "Voice dictation").
--
-- api/speech-recognize.ts is the only thing that holds the Google Speech-to-Text API key, so
-- it is also where the per-user monthly cap is enforced. The counter can't be a plain
-- user-writable table: RLS would let a user reset their own count with the anon key. Instead
-- the table is select-only for users, and increments go through a security-definer function
-- that checks the limit and adds to the count in one step.
--
-- Includes its own grants (raw SQL doesn't auto-grant — see 022).
-- Code that depends on this degrades cleanly: until it's applied, dictation reports
-- "usage tracking unavailable" instead of transcribing; nothing else in the app is affected.

create table speech_usage (
  user_id uuid    not null references auth.users on delete cascade,
  day     date    not null default current_date,
  seconds integer not null default 0,
  primary key (user_id, day)
);

alter table speech_usage enable row level security;
create policy "Users can read their own speech usage" on speech_usage for select using (auth.uid() = user_id);

grant select on speech_usage to authenticated;

-- Adds p_seconds to today's row for the calling user, unless doing so would push the current
-- calendar month's total past p_monthly_limit. Returns whether the usage was recorded.
create or replace function record_speech_usage(p_seconds integer, p_monthly_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
begin
  if auth.uid() is null or p_seconds <= 0 then
    return false;
  end if;

  select coalesce(sum(seconds), 0) into v_used
    from speech_usage
   where user_id = auth.uid()
     and day >= date_trunc('month', current_date)::date;

  if v_used + p_seconds > p_monthly_limit then
    return false;
  end if;

  insert into speech_usage (user_id, day, seconds)
  values (auth.uid(), current_date, p_seconds)
  on conflict (user_id, day) do update set seconds = speech_usage.seconds + excluded.seconds;

  return true;
end;
$$;

revoke all on function record_speech_usage(integer, integer) from public;
grant execute on function record_speech_usage(integer, integer) to authenticated;

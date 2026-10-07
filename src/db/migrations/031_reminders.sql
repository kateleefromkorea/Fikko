-- Email reminders. Additive: safe to run on the live database, and safe to re-run.
--
-- One row per member who has chosen a reminder setting; no row means off.
-- Members set how often and at what hour (in their own time zone); the hourly
-- job in api/email.ts sends at most one email a day, only when nothing has been
-- logged that day, slows to weekly after 7 quiet days and stops after 30.
-- Every email carries a one-click unsubscribe link using unsubscribe_token.

create table if not exists public.reminder_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  frequency text not null default 'daily' check (frequency in ('daily', 'weekdays', 'weekly', 'off')),
  -- Local hour to send, 0–23.
  send_hour smallint not null default 19 check (send_hour between 0 and 23),
  -- IANA time zone from the member's browser, e.g. "Australia/Sydney".
  time_zone text not null default 'UTC' check (char_length(time_zone) between 1 and 64),
  -- The member's local date of the last email, so a day never gets two.
  last_sent_on date,
  unsubscribe_token uuid not null unique default gen_random_uuid(),
  updated_at timestamptz not null default now()
);

alter table public.reminder_settings enable row level security;
revoke all on public.reminder_settings from anon, authenticated;
-- Members choose their own settings; the send record and token are the server's.
grant select on public.reminder_settings to authenticated;
grant insert (user_id, frequency, send_hour, time_zone, updated_at) on public.reminder_settings to authenticated;
-- user_id too, because the app saves with an upsert; the policy keeps it to their own.
grant update (user_id, frequency, send_hour, time_zone, updated_at) on public.reminder_settings to authenticated;

drop policy if exists "Members read their reminder settings" on public.reminder_settings;
create policy "Members read their reminder settings" on public.reminder_settings
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Members add their reminder settings" on public.reminder_settings;
create policy "Members add their reminder settings" on public.reminder_settings
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Members change their reminder settings" on public.reminder_settings;
create policy "Members change their reminder settings" on public.reminder_settings
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Everyone with reminders on, with what the hourly job needs to decide: their
-- email and first name, and the days they logged anything in the last 40 days
-- (dates as the member logged them, in their own time zone). Server only.
create or replace function public.reminder_candidates()
returns table (
  user_id uuid,
  email text,
  first_name text,
  frequency text,
  send_hour smallint,
  time_zone text,
  last_sent_on date,
  unsubscribe_token uuid,
  signed_up date,
  logged_days date[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.user_id,
         u.email::text,
         split_part(trim(coalesce(p.name, '')), ' ', 1),
         r.frequency,
         r.send_hour,
         r.time_zone,
         r.last_sent_on,
         r.unsubscribe_token,
         (u.created_at at time zone 'utc')::date,
         coalesce((
           select array_agg(distinct d order by d)
           from (
             select date as d from public.habit_entries e where e.user_id = r.user_id and e.value > 0 and e.date >= current_date - 40
             union
             select date from public.food_log_items f where f.user_id = r.user_id and f.date >= current_date - 40
             union
             select date from public.custom_habit_entries c where c.user_id = r.user_id and c.value > 0 and c.date >= current_date - 40
           ) days
         ), '{}')
  from public.reminder_settings r
  join auth.users u on u.id = r.user_id
  left join public.profiles p on p.user_id = r.user_id
  where r.frequency <> 'off'
    and u.email is not null
    and u.email_confirmed_at is not null
    and p.deletion_scheduled_for is null;
$$;

revoke all on function public.reminder_candidates() from public, anon, authenticated;
grant execute on function public.reminder_candidates() to service_role;

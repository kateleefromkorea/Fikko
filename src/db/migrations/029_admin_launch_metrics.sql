-- Launch metrics for /admin: sign-up funnel, founding places, active members,
-- return rates and feature use. Read-only and additive: safe to run on the live
-- database, and safe to re-run.
--
-- Everything is a count across members; no names, emails or ids leave the
-- function. Admin accounts are left out so testing doesn't skew the numbers.
--
-- "Active" means the member logged something (a habit, a food or a custom
-- habit) on that day. Logged days are the member's own local dates; sign-up and
-- setup times are converted to UTC dates, so return rates can be a day out at
-- the edges.

create or replace function public.admin_launch_metrics(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'utc')::date;
  since date;
  result jsonb;
begin
  if public.admin_status() <> 'ok' then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  p_days := greatest(1, least(coalesce(p_days, 30), 400));
  since := today - (p_days - 1);

  with members as (
    select u.id,
           (u.created_at at time zone 'utc')::date as signed_up,
           u.email_confirmed_at is not null as confirmed,
           (p.onboarding_completed_at at time zone 'utc')::date as onboarded,
           p.deletion_scheduled_for is not null as leaving,
           p.fikko_seed is not null as has_seed
    from auth.users u
    left join public.profiles p on p.user_id = u.id
    where not exists (select 1 from public.admins a where a.user_id = u.id)
  ),
  activity as (
    select user_id, date from public.habit_entries where value > 0
    union
    select user_id, date from public.food_log_items
    union
    select user_id, date from public.custom_habit_entries where value > 0
  ),
  member_activity as (
    select a.user_id, a.date from activity a join members m on m.id = a.user_id
  ),
  logged_ever as (select distinct user_id from member_activity),
  active_7 as (select distinct user_id from member_activity where date between today - 6 and today),
  active_30 as (select distinct user_id from member_activity where date between today - 29 and today),
  days as (
    select d::date as day from generate_series(since, today, interval '1 day') d
  ),
  weeks as (
    select (date_trunc('week', today) - (n || ' weeks')::interval)::date as week
    from generate_series(0, 11) n
  ),
  -- Return rates, for members who finished setup long enough ago to measure.
  day1 as (
    select m.id,
           exists (select 1 from member_activity x where x.user_id = m.id and x.date = m.onboarded + 1) as came_back
    from members m where m.onboarded is not null and m.onboarded <= today - 1
  ),
  week2 as (
    select m.id,
           exists (select 1 from member_activity x where x.user_id = m.id and x.date between m.onboarded + 7 and m.onboarded + 13) as came_back
    from members m where m.onboarded is not null and m.onboarded <= today - 13
  ),
  funnel as (
    select
      count(*) as signed_up,
      count(*) filter (where confirmed) as confirmed,
      count(*) filter (where onboarded is not null) as onboarded,
      count(*) filter (where id in (select user_id from logged_ever)) as logged,
      count(*) filter (where id in (select user_id from active_7)) as active_7d
    from members
  ),
  funnel_range as (
    select
      count(*) as signed_up,
      count(*) filter (where confirmed) as confirmed,
      count(*) filter (where onboarded is not null) as onboarded,
      count(*) filter (where id in (select user_id from logged_ever)) as logged,
      count(*) filter (where id in (select user_id from active_7)) as active_7d
    from members where signed_up >= since
  ),
  habit_use as (
    select category::text as feature, count(distinct e.user_id) as members
    from public.habit_entries e join members m on m.id = e.user_id
    where e.date between since and today and e.value > 0
    group by category
  ),
  ai_use as (
    select feature, count(distinct c.user_id) as members
    from public.ai_costs c join members m on m.id = c.user_id
    where (c.created_at at time zone 'utc')::date between since and today
      and c.feature in ('coach', 'voice', 'photo', 'interactions', 'recipe')
    group by feature
  )
  select jsonb_build_object(
    'funnel', (select to_jsonb(f) from funnel f),
    'funnel_range', (select to_jsonb(f) from funnel_range f),
    -- Members who'd hold a founding place today: confirmed, set up, not leaving.
    'founding_qualified', (select count(*) from members where confirmed and onboarded is not null and not leaving),
    'active_7d', (select count(*) from active_7),
    'active_30d', (select count(*) from active_30),
    'daily_active', (
      select jsonb_agg(jsonb_build_object(
        'day', days.day,
        'active', (select count(distinct user_id) from member_activity x where x.date = days.day)
      ) order by days.day)
      from days
    ),
    'weekly_active', (
      select jsonb_agg(jsonb_build_object(
        'week', weeks.week,
        'active', (select count(distinct user_id) from member_activity x where x.date between weeks.week and weeks.week + 6)
      ) order by weeks.week)
      from weeks
    ),
    'day1', jsonb_build_object('members', (select count(*) from day1), 'returned', (select count(*) from day1 where came_back)),
    'week2', jsonb_build_object('members', (select count(*) from week2), 'returned', (select count(*) from week2 where came_back)),
    'features', jsonb_build_object(
      'habits', coalesce((select jsonb_object_agg(feature, members) from habit_use), '{}'::jsonb),
      'food_items', (select count(distinct f.user_id) from public.food_log_items f join members m on m.id = f.user_id where f.date between since and today),
      'custom_habits', (select count(distinct c.user_id) from public.custom_habit_entries c join members m on m.id = c.user_id where c.date between since and today and c.value > 0),
      'ai', coalesce((select jsonb_object_agg(feature, members) from ai_use), '{}'::jsonb),
      'fitbit_connected', (select count(distinct d.user_id) from public.device_connections d join members m on m.id = d.user_id where d.provider = 'google'),
      'fitbit_requests', (select count(*) from public.wearable_beta b join members m on m.id = b.user_id where b.status = 'requested'),
      'my_fikko_seed', (select count(*) from members where has_seed)
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_launch_metrics(integer) from public, anon;
grant execute on function public.admin_launch_metrics(integer) to authenticated;

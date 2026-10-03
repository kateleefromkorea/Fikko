-- Admin page needs a code from an authenticator app (two-factor), not just
-- a password. Supabase marks a session "aal2" once its owner has entered a
-- valid code; admin_stats now refuses any session that isn't.
--
-- Safe to re-run.
--
-- Lost your phone? Remove your authenticator in the SQL editor, then open
-- /admin and set it up again with the new phone (swap in your email):
--   delete from auth.mfa_factors
--   where user_id = (select id from auth.users where email = 'you@example.com');

-- What the signed-in account may do on /admin:
--   'none'      not an admin (the page sends them back to the app)
--   'needs_mfa' an admin who hasn't entered an authenticator code this session
--   'ok'        an admin with a verified code
create or replace function public.admin_status()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not public.is_admin() then 'none'
    when coalesce((select auth.jwt()) ->> 'aal', '') <> 'aal2' then 'needs_mfa'
    else 'ok'
  end;
$$;

revoke all on function public.admin_status() from public, anon;
grant execute on function public.admin_status() to authenticated;

-- Same as migration 016, but also requires the two-factor code.
create or replace function public.admin_stats(p_days integer default 30, p_site text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  since date;
  result jsonb;
begin
  if public.admin_status() <> 'ok' then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  p_days := greatest(1, least(coalesce(p_days, 30), 400));
  since := (now() at time zone 'utc')::date - (p_days - 1);

  with days as (
    select d::date as day from generate_series(since, (now() at time zone 'utc')::date, interval '1 day') d
  ),
  v as (select * from public.analytics_views where day >= since and (p_site is null or site = p_site)),
  u as (select * from public.analytics_visitors where day >= since and (p_site is null or site = p_site)),
  s as (select (created_at at time zone 'utc')::date as day from auth.users where created_at >= since)
  select jsonb_build_object(
    'daily', (
      select jsonb_agg(jsonb_build_object(
        'day', days.day,
        'views', coalesce((select sum(views) from v where v.day = days.day), 0),
        'visitors', coalesce((select sum(visitors) from u where u.day = days.day), 0),
        'signups', (select count(*) from s where s.day = days.day)
      ) order by days.day)
      from days
    ),
    'pages', coalesce((
      select jsonb_agg(x) from (
        select site, path, sum(views) as views from v group by site, path order by views desc limit 20
      ) x
    ), '[]'::jsonb),
    'referrers', coalesce((
      select jsonb_agg(x) from (
        select referrer, sum(visitors) as visitors from u group by referrer order by visitors desc limit 20
      ) x
    ), '[]'::jsonb),
    'devices', coalesce((
      select jsonb_agg(x) from (
        select device, sum(visitors) as visitors from u group by device order by visitors desc
      ) x
    ), '[]'::jsonb),
    'countries', coalesce((
      select jsonb_agg(x) from (
        select country, sum(visitors) as visitors from u group by country order by visitors desc limit 20
      ) x
    ), '[]'::jsonb),
    'members', (select count(*) from auth.users)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_stats(integer, text) from public, anon;
grant execute on function public.admin_stats(integer, text) to authenticated;

-- Admin site and privacy-friendly visitor stats.
--
-- Additive and safe to re-run.
--
-- Built so storage stays small and bounded:
--   * No raw page-view log. Each view bumps a per-day counter instead, so a
--     day costs one row per page, not one row per visit.
--   * Unique visitors are counted with an anonymous hash (made on the server
--     from IP + browser + a salt that changes every day, never stored in a
--     readable form). Hashes are kept for two days at most, then deleted.
--   * Daily counters are kept for 400 days, then deleted.
--   * Each day holds at most 300 counter rows per table; anything past that is
--     folded into an "other" row, so junk traffic can't grow the tables.
--
-- After running this, make yourself an admin (swap in your sign-in email):
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'you@example.com'
--   on conflict do nothing;

-- ── Admins ─────────────────────────────────────────────────────────────────
-- Who can open /admin. Rows are added by hand in the SQL editor; the app
-- can't read or change this table directly.
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;
-- No policies: only the security-definer functions below can read it.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ── Visitor stats ──────────────────────────────────────────────────────────
-- site: 'web' (marketing site) or 'app'.

-- Page views per page per day.
create table if not exists public.analytics_views (
  day date not null,
  site text not null check (site in ('web', 'app')),
  path text not null check (char_length(path) <= 80),
  views integer not null default 0,
  primary key (day, site, path)
);

-- Unique visitors per day, by where they came from and what they used.
-- A visitor is counted once a day, on their first view.
create table if not exists public.analytics_visitors (
  day date not null,
  site text not null check (site in ('web', 'app')),
  referrer text not null check (char_length(referrer) <= 80),
  device text not null check (device in ('mobile', 'tablet', 'desktop', 'other')),
  country text not null check (char_length(country) <= 2),
  visitors integer not null default 0,
  primary key (day, site, referrer, device, country)
);

-- Anonymous hashes of today's (and yesterday's) visitors, only to tell a new
-- visitor from a returning one. Deleted after two days.
create table if not exists public.analytics_seen (
  day date not null,
  site text not null,
  visitor bytea not null,
  primary key (day, site, visitor)
);

alter table public.analytics_views enable row level security;
alter table public.analytics_visitors enable row level security;
alter table public.analytics_seen enable row level security;
-- No policies: written only by track_page_view (server) and read only by admin_stats.

-- Called by /api/track with the server's secret key. Inputs are already
-- cleaned there; the checks here are the last line of defence.
create or replace function public.track_page_view(
  p_site text, p_path text, p_referrer text, p_device text, p_country text, p_visitor bytea
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'utc')::date;
  row_cap constant integer := 300;
begin
  if p_site not in ('web', 'app') then return; end if;
  p_path := left(coalesce(nullif(p_path, ''), '/'), 80);
  p_referrer := left(coalesce(nullif(p_referrer, ''), 'direct'), 80);
  p_device := case when p_device in ('mobile', 'tablet', 'desktop') then p_device else 'other' end;
  p_country := coalesce(nullif(upper(left(p_country, 2)), ''), '--');

  -- Page view. A page not seen yet today only gets its own row while the day is under the cap.
  if not exists (select 1 from public.analytics_views where day = today and site = p_site and path = p_path)
     and (select count(*) from public.analytics_views where day = today) >= row_cap then
    p_path := '(other)';
  end if;
  insert into public.analytics_views as v (day, site, path, views)
  values (today, p_site, p_path, 1)
  on conflict (day, site, path) do update set views = v.views + 1;

  -- Unique visitor: only counted the first time today.
  insert into public.analytics_seen (day, site, visitor)
  values (today, p_site, p_visitor)
  on conflict do nothing;
  if not found then return; end if;

  if not exists (
       select 1 from public.analytics_visitors
       where day = today and site = p_site and referrer = p_referrer and device = p_device and country = p_country)
     and (select count(*) from public.analytics_visitors where day = today) >= row_cap then
    p_referrer := '(other)';
    p_country := '--';
  end if;
  insert into public.analytics_visitors as a (day, site, referrer, device, country, visitors)
  values (today, p_site, p_referrer, p_device, p_country, 1)
  on conflict (day, site, referrer, device, country) do update set visitors = a.visitors + 1;

  -- Housekeeping, run on new visitors only. Each delete walks the start of a
  -- day-ordered index, so it's near-free when there's nothing to remove.
  delete from public.analytics_seen where day < today - 1;
  delete from public.analytics_views where day < today - 400;
  delete from public.analytics_visitors where day < today - 400;
end;
$$;

revoke all on function public.track_page_view(text, text, text, text, text, bytea) from public, anon, authenticated;
grant execute on function public.track_page_view(text, text, text, text, text, bytea) to service_role;

-- ── Admin dashboard ────────────────────────────────────────────────────────
-- Everything the /admin page shows, in one call. Refuses anyone who isn't an admin.
-- p_site: 'web', 'app', or null for both.
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
  if not public.is_admin() then
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

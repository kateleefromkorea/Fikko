-- AI spend tracking. Additive: safe to run on the live database, and safe to re-run.
--
-- One row per call to Anthropic's API, written only by the server (api/_lib/aiCost.ts,
-- with the secret key): which feature, which model, the token counts and what it cost.
-- No message text, photos or replies are stored here, only counts.
--
-- Unlike coach_usage (which counts toward the daily limit), every call is recorded,
-- including the coach's safety checks and calls that failed part-way, because they
-- are all billed.
--
-- When a member deletes their account their rows stay, unlinked (user_id becomes
-- null), so past spend totals don't change.

create table if not exists public.ai_costs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  feature text not null check (feature in ('coach', 'coach_screen', 'coach_review', 'voice', 'photo', 'interactions', 'recipe')),
  model text not null check (char_length(model) <= 60),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  cache_read_tokens integer not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens integer not null default 0 check (cache_write_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_usd numeric(12, 6) not null default 0 check (cost_usd >= 0),
  created_at timestamptz not null default now()
);

create index if not exists ai_costs_created_idx on public.ai_costs (created_at);
create index if not exists ai_costs_user_created_idx on public.ai_costs (user_id, created_at);

alter table public.ai_costs enable row level security;
-- No policies and no grants: members can't read or write it; only the server and
-- the admin function below can.
revoke all on public.ai_costs from anon, authenticated;

-- AI spend for the admin page (two-factor required, like admin_stats in migration 017).
-- Days are UTC. Members are shown by the first 8 characters of their id, not by name or email.
create or replace function public.admin_ai_costs(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  since date;
  today date := (now() at time zone 'utc')::date;
  month_start date := date_trunc('month', now() at time zone 'utc')::date;
  result jsonb;
begin
  if public.admin_status() <> 'ok' then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  p_days := greatest(1, least(coalesce(p_days, 30), 400));
  since := today - (p_days - 1);

  with days as (
    select d::date as day from generate_series(since, today, interval '1 day') d
  ),
  c as (
    select (created_at at time zone 'utc')::date as day, user_id, feature, cost_usd,
           input_tokens, cache_read_tokens
    from public.ai_costs
    where created_at >= (since::timestamp at time zone 'utc')
  ),
  member_days as (
    select day, user_id, sum(cost_usd) as cost, count(*) as calls
    from c where user_id is not null group by day, user_id
  )
  select jsonb_build_object(
    'daily', (
      select jsonb_agg(jsonb_build_object(
        'day', days.day,
        'cost', coalesce((select sum(cost_usd) from c where c.day = days.day), 0),
        'calls', (select count(*) from c where c.day = days.day),
        'members', (select count(distinct user_id) from c where c.day = days.day),
        'per_member', coalesce((select avg(cost) from member_days m where m.day = days.day), 0)
      ) order by days.day)
      from days
    ),
    'features', coalesce((
      select jsonb_agg(x order by x.cost desc) from (
        select feature, sum(cost_usd) as cost, count(*) as calls from c group by feature
      ) x
    ), '[]'::jsonb),
    'top_member_days', coalesce((
      select jsonb_agg(x) from (
        select day, left(user_id::text, 8) as member, cost, calls
        from member_days order by cost desc limit 15
      ) x
    ), '[]'::jsonb),
    'cache_hit_rate', (
      select case when sum(input_tokens + cache_read_tokens) > 0
        then sum(cache_read_tokens)::numeric / sum(input_tokens + cache_read_tokens) else 0 end
      from c where feature = 'coach'
    ),
    'today', coalesce((select sum(cost_usd) from public.ai_costs where created_at >= (today::timestamp at time zone 'utc')), 0),
    'month_to_date', coalesce((select sum(cost_usd) from public.ai_costs where created_at >= (month_start::timestamp at time zone 'utc')), 0),
    'days_into_month', today - month_start + 1,
    'days_in_month', extract(day from (month_start + interval '1 month' - interval '1 day'))::integer
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_ai_costs(integer) from public, anon;
grant execute on function public.admin_ai_costs(integer) to authenticated;

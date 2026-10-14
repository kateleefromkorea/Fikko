-- A 7-day Premium trial, no card needed. One per account, ever. Additive and
-- safe to re-run. Needs 035_plans.sql (and 030_founding_members.sql).
--
-- A member on Free taps "Start free trial" in the app, which calls
-- start_trial(). effective_plan() then returns Premium until ends_at, after
-- which they're back on Free unless they've subscribed. Trials only start
-- while plans are enforced, so nobody uses theirs up during the free launch.

create table if not exists public.plan_trials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'premium' check (plan in ('premium', 'max')),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null
);

alter table public.plan_trials enable row level security;
revoke all on public.plan_trials from anon, authenticated;
grant select on public.plan_trials to authenticated;

drop policy if exists "Members read their own trial" on public.plan_trials;
create policy "Members read their own trial" on public.plan_trials
  for select to authenticated using (user_id = (select auth.uid()));

-- As in 035, with a running trial checked after subscriptions and founding places.
create or replace function public.effective_plan(p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.plan_settings;
  sub public.subscriptions;
  claimed timestamptz;
  trial public.plan_trials;
begin
  select * into s from public.plan_settings where id;
  if not coalesce(s.enforced, false) then
    return 'max';
  end if;
  if exists (select 1 from public.admins where user_id = p_user) then
    return 'max';
  end if;

  select * into sub from public.subscriptions where user_id = p_user;
  if found and sub.status in ('active', 'trialing', 'past_due', 'canceled')
     and (sub.current_period_end is null or sub.current_period_end > now()) then
    -- A canceled plan with no end date is treated as over.
    if not (sub.status = 'canceled' and sub.current_period_end is null) then
      return sub.plan;
    end if;
  end if;

  select claimed_at into claimed from public.founding_members where user_id = p_user;
  if found and greatest(claimed, coalesce(s.launched_at, claimed)) + interval '12 months' > now() then
    return 'premium';
  end if;

  select * into trial from public.plan_trials where user_id = p_user;
  if found and trial.ends_at > now() then
    return trial.plan;
  end if;

  return 'free';
end;
$$;

revoke all on function public.effective_plan(uuid) from public, anon, authenticated;
grant execute on function public.effective_plan(uuid) to service_role;

-- The signed-in member's plan, plus their trial: when it ends, and whether
-- they can still start one (on Free, plans enforced, never had one).
create or replace function public.my_plan()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.plan_state(me) || jsonb_build_object(
    'trial_ends_at', (select ends_at from public.plan_trials where user_id = me),
    'trial_available',
      not exists (select 1 from public.plan_trials where user_id = me)
      and public.effective_plan(me) = 'free'
      and coalesce((select enforced from public.plan_settings where id), false)
  )
  from (select (select auth.uid()) as me) m
  where me is not null;
$$;

revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

-- Starts the signed-in member's 7-day Premium trial. Returns when it ends.
create or replace function public.start_trial()
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  ends timestamptz := now() + interval '7 days';
begin
  if me is null then
    raise exception 'Sign in to start a trial.' using errcode = 'P0001';
  end if;
  if not coalesce((select enforced from public.plan_settings where id), false) then
    raise exception 'Everything is unlocked during the launch, so there''s no need for a trial yet.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.plan_trials where user_id = me) then
    raise exception 'You''ve already had your free trial.' using errcode = 'P0001';
  end if;
  if public.effective_plan(me) <> 'free' then
    raise exception 'You already have a paid plan.' using errcode = 'P0001';
  end if;

  insert into public.plan_trials (user_id, plan, ends_at) values (me, 'premium', ends);
  return ends;
end;
$$;

revoke all on function public.start_trial() from public, anon;
grant execute on function public.start_trial() to authenticated;

-- Plans (Free / Premium / Max): who is on which plan, and the switch that
-- turns enforcement on. Additive and safe to re-run.
--
-- Until payments exist, enforcement is OFF: effective_plan() returns 'max' for
-- everyone, so the app behaves as it does today. When paid plans open:
--   update public.plan_settings set enforced = true, launched_at = now();
-- That one statement starts the limits for free members and starts the
-- founding members' free year (12 months from launched_at, or from the day
-- they claimed their place if that's later). Set enforced = false to roll back.
--
-- Rows in `subscriptions` are written by the server only (the payment
-- provider's webhook, or by hand in the SQL editor). Members can read their own.
--   Give someone a plan by hand:
--     select public.grant_plan('<user id>', 'premium', 'manual', now() + interval '1 year');

create table if not exists public.plan_settings (
  id boolean primary key default true check (id), -- one row only
  enforced boolean not null default false,
  launched_at timestamptz
);
insert into public.plan_settings (id) values (true) on conflict (id) do nothing;

alter table public.plan_settings enable row level security;
revoke all on public.plan_settings from anon, authenticated;

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null check (plan in ('premium', 'max')),
  -- active: paid up. trialing: in a trial. past_due: payment failed, still has access
  -- until the provider gives up. canceled: ends at current_period_end.
  status text not null default 'active' check (status in ('active', 'trialing', 'past_due', 'canceled')),
  source text not null check (source in ('paddle', 'apple', 'google', 'manual', 'gift')),
  -- The payment provider's ids, for matching webhooks.
  provider_customer_id text,
  provider_subscription_id text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_provider_sub_idx on public.subscriptions (provider_subscription_id);

alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;

drop policy if exists "Members read their own subscription" on public.subscriptions;
create policy "Members read their own subscription" on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

-- The plan a member has right now: Max for admins, then a paid (or hand-granted)
-- subscription that hasn't run out, then Premium during a founding member's free
-- year, otherwise Free. While enforcement is off, everyone gets Max.
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

  return 'free';
end;
$$;

revoke all on function public.effective_plan(uuid) from public, anon, authenticated;

-- A member's plan and whether limits are being enforced, as one object, for the server.
create or replace function public.plan_state(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'plan', public.effective_plan(p_user),
    'enforced', coalesce((select enforced from public.plan_settings where id), false)
  );
$$;

revoke all on function public.plan_state(uuid) from public, anon, authenticated;
grant execute on function public.plan_state(uuid) to service_role;
grant execute on function public.effective_plan(uuid) to service_role;

-- The signed-in member's own plan, for the app.
create or replace function public.my_plan()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.plan_state((select auth.uid()))
  where (select auth.uid()) is not null;
$$;

revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

-- Gives (or changes) a member's plan. For the SQL editor and the server.
create or replace function public.grant_plan(p_user uuid, p_plan text, p_source text default 'manual', p_until timestamptz default null)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.subscriptions (user_id, plan, status, source, current_period_end, updated_at)
  values (p_user, p_plan, 'active', p_source, p_until, now())
  on conflict (user_id) do update
    set plan = excluded.plan, status = 'active', source = excluded.source,
        current_period_end = excluded.current_period_end, updated_at = now();
$$;

revoke all on function public.grant_plan(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.grant_plan(uuid, text, text, timestamptz) to service_role;

-- Free members can keep 3 custom habits. Enforced here so the app can't be
-- bypassed. Re-saving an existing habit is always allowed.
create or replace function public.limit_custom_habits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.custom_habits where id = new.id) then
    return new;
  end if;
  if public.effective_plan(new.user_id) = 'free'
     and (select count(*) from public.custom_habits where user_id = new.user_id) >= 3 then
    raise exception 'Free plans can have 3 custom habits. Upgrade to add more.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists limit_custom_habits on public.custom_habits;
create trigger limit_custom_habits
  before insert on public.custom_habits
  for each row execute function public.limit_custom_habits();

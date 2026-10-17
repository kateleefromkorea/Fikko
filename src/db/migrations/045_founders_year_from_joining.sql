-- A founding member's free year of Premium now runs from the day they joined
-- (founding_members.claimed_at), not from the day plans were switched on.
-- Same as 040's effective_plan in every other way. Additive; safe to re-run.

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
  if found and claimed + interval '12 months' > now() then
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

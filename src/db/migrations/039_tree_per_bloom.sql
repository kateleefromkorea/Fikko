-- One real tree per full bloom, for Max members. Replaces the monthly tree rule
-- from 037 and 038: every plant a member grows to full bloom (40 complete days)
-- and harvests donates a real tree, but only when the member is on Max at that
-- moment. The harvest records it in the same transaction, so nothing needs to
-- be replayed from the habit log and no scheduled job is involved.
-- Additive apart from replacing harvest_fikko(); safe to re-run. Needs 026,
-- 035 and 037 first.
--
-- fikko_garden.tree_status (037 allows all three):
--   'none'    the member wasn't on Max when they harvested: no real tree
--   'pending' a real tree is owed, not yet planted with the planting partner
--   'planted' planted
-- While paid plans aren't enforced (plan_settings.enforced, migration 035)
-- everyone counts as Max, so every harvest is 'pending'. Plants harvested
-- before this migration keep the status they have.
--
-- fikko_trees (037/038) is no longer written to. It is left in place, empty,
-- rather than dropped; remove it later with: drop table public.fikko_trees;
comment on table public.fikko_trees is 'Unused since 039_tree_per_bloom.sql: trees are per harvest now (fikko_garden.tree_status).';

-- The return type gains real_tree, which create or replace can't do.
drop function if exists public.harvest_fikko(date, int, text);

create function public.harvest_fikko(p_today date, p_complete_days int, p_reward text)
returns table (garden_id uuid, premium_month boolean, garden_size int, real_tree boolean)
language plpgsql
security definer set search_path = public
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  prof record;
  new_id uuid;
  size int;
  earns_month boolean := false;
  plants_tree boolean;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  if p_today is null or abs(p_today - (now() at time zone 'utc')::date) > 1 then
    raise exception 'Invalid date';
  end if;
  if p_reward is not null and p_reward not in ('mint', 'stripe', 'bee', 'snail') then
    raise exception 'Unknown reward';
  end if;
  if p_reward is not null and exists (select 1 from public.fikko_garden g where g.user_id = me and g.reward = p_reward) then
    raise exception 'Reward already owned';
  end if;

  select fikko_seed, fikko_planted_on, fikko_pot, fikko_companion into prof
    from public.profiles where user_id = me for update;
  if prof.fikko_seed is null or prof.fikko_planted_on is null then
    raise exception 'Nothing planted';
  end if;
  -- 40 complete days can't happen in fewer than 40 calendar days.
  if p_complete_days is null or p_complete_days < 40 or p_complete_days > (p_today - prof.fikko_planted_on) + 1 then
    raise exception 'Not in bloom yet';
  end if;

  select count(*) + 1 into size from public.fikko_garden g where g.user_id = me;
  if size % 3 = 0 and not exists (
    select 1 from public.fikko_garden g
     where g.user_id = me and g.premium_month and g.harvested_on > p_today - 365
  ) then
    earns_month := true;
  end if;

  -- A real tree only for Max (everyone, while plans aren't enforced).
  plants_tree := public.effective_plan(me) = 'max';

  insert into public.fikko_garden (user_id, seed, pot, companion, planted_on, harvested_on, complete_days, reward, premium_month, tree_status)
  values (me, prof.fikko_seed, prof.fikko_pot, prof.fikko_companion, prof.fikko_planted_on, p_today, p_complete_days, p_reward, earns_month,
          case when plants_tree then 'pending' else 'none' end)
  returning id into new_id;

  -- The pot is empty until the member plants their next seed.
  update public.profiles set fikko_seed = null, fikko_planted_on = null where user_id = me;

  return query select new_id, earns_month, size, plants_tree;
end;
$$;

revoke execute on function public.harvest_fikko(date, int, text) from public, anon;
grant execute on function public.harvest_fikko(date, int, text) to authenticated;

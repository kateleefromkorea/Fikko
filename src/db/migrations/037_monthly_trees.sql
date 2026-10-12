-- Monthly trees: Fikko donates and plants a real tree for every calendar month
-- in which a member completed every habit on every day (a day covered by a
-- rain cloud still counts). This replaces the tree per harvested plant from
-- 026_fikko_garden.sql.
-- Additive: safe to run on the live database, and safe to re-run. Needs 026
-- first.
--
-- Trees cost money, so members can't write rows here: api/trees.ts records
-- them with the service role, checking each month against the member's habit
-- log with the rule in src/lib/treeRules.ts. A row is 'pending' until it is
-- planted with the planting partner, then 'planted'.

create table if not exists public.fikko_trees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The first day of the completed month.
  month date not null check (extract(day from month) = 1),
  status text not null default 'pending' check (status in ('pending', 'planted')),
  planted_on date,
  created_at timestamptz not null default now(),
  unique (user_id, month)
);

create index if not exists fikko_trees_status_idx on public.fikko_trees (status, month);

alter table public.fikko_trees enable row level security;

drop policy if exists "fikko_trees readable by owner" on public.fikko_trees;
create policy "fikko_trees readable by owner" on public.fikko_trees
  for select to authenticated
  using (user_id = (select auth.uid()));
-- No insert, update or delete policies: only api/trees.ts (service role) writes here.

-- Harvesting no longer plants a tree. New harvests are marked 'none'; rows
-- harvested before this migration keep the status they had, so any tree
-- already promised for them can still be planted. To see them:
--   select user_id, harvested_on from public.fikko_garden where tree_status = 'pending';
alter table public.fikko_garden drop constraint if exists fikko_garden_tree_status_check;
alter table public.fikko_garden add constraint fikko_garden_tree_status_check
  check (tree_status in ('none', 'pending', 'planted'));
alter table public.fikko_garden alter column tree_status set default 'none';
comment on column public.fikko_garden.tree_status is
  'Trees per harvest ended with 037_monthly_trees.sql: ''none'' from then on. Trees are now in fikko_trees.';

-- Members the monthly job checks: everyone who has finished onboarding and
-- isn't waiting out an account deletion.
create or replace function public.fikko_tree_candidates()
returns table (user_id uuid, water_goal numeric)
language sql
security definer set search_path = public
as $$
  select p.user_id, p.water_goal
    from public.profiles p
   where p.onboarding_completed_at is not null
     and p.deletion_scheduled_for is null;
$$;

revoke execute on function public.fikko_tree_candidates() from public, anon, authenticated;
grant execute on function public.fikko_tree_candidates() to service_role;

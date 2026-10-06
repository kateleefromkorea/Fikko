-- My Fikko garden: plants a member has grown to full bloom and harvested.
-- Additive: safe to run on the live database, and safe to re-run. Needs
-- 025_my_fikko.sql first.
--
-- Every harvest:
--   • moves the plant into the member's garden, where it stays for good;
--   • records the free reward the member picked (a pot or companion);
--   • records a real tree to plant (tree_status 'pending' until it is
--     planted with the planting partner, then 'planted').
-- Every 3rd harvest also earns a free month of Premium, at most one a year.
-- Bonus seeds unlocked by harvesting are worked out in the app from the
-- number of garden rows (GARDENER_SEEDS in src/lib/fikko.ts).
--
-- Trees and Premium months cost money, so members can't write garden rows
-- themselves: only harvest_fikko() below does, and it checks the plant has
-- been growing long enough to have bloomed.

create table if not exists public.fikko_garden (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  seed text not null,
  pot text not null,
  companion text not null,
  planted_on date not null,
  harvested_on date not null,
  complete_days int not null check (complete_days between 0 and 10000),
  reward text,
  tree_status text not null default 'pending' check (tree_status in ('pending', 'planted')),
  premium_month boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists fikko_garden_user_idx on public.fikko_garden (user_id, created_at);
-- One harvest per planting.
create unique index if not exists fikko_garden_planting_idx on public.fikko_garden (user_id, planted_on, seed);

alter table public.fikko_garden enable row level security;

drop policy if exists "fikko_garden readable by owner" on public.fikko_garden;
create policy "fikko_garden readable by owner" on public.fikko_garden
  for select to authenticated
  using (user_id = (select auth.uid()));
-- No insert, update or delete policies: only harvest_fikko() writes here.

-- The new seed, pots and companions.
alter table public.profiles drop constraint if exists profiles_fikko_check;
alter table public.profiles add constraint profiles_fikko_check check (
      (fikko_seed is null or fikko_seed in ('sprout', 'sunflower', 'tulip', 'blossom', 'lavender', 'lotus', 'fern'))
  and fikko_pot in ('clay', 'white', 'teal', 'gold', 'mint', 'stripe')
  and fikko_companion in ('none', 'ladybug', 'butterfly', 'bee', 'snail')
);

-- ── Harvesting ─────────────────────────────────────────────────────────────
-- p_today: the member's local date (the app's day keys are local), allowed to
--   differ from the server's UTC date by a day either way.
-- p_complete_days: complete days the app counted (40 or more to bloom).
-- p_reward: the free extra picked, or null when every reward is already owned.
-- Returns the new row's id, whether a Premium month was earned, and how many
-- plants the garden now holds.

create or replace function public.harvest_fikko(p_today date, p_complete_days int, p_reward text)
returns table (garden_id uuid, premium_month boolean, garden_size int)
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

  insert into public.fikko_garden (user_id, seed, pot, companion, planted_on, harvested_on, complete_days, reward, premium_month)
  values (me, prof.fikko_seed, prof.fikko_pot, prof.fikko_companion, prof.fikko_planted_on, p_today, p_complete_days, p_reward, earns_month)
  returning id into new_id;

  -- The pot is empty until the member plants their next seed.
  update public.profiles set fikko_seed = null, fikko_planted_on = null where user_id = me;

  return query select new_id, earns_month, size;
end;
$$;

revoke execute on function public.harvest_fikko(date, int, text) from public, anon;
grant execute on function public.harvest_fikko(date, int, text) to authenticated;

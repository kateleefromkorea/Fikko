-- Additive migration — safe to run against the live database, and safe to
-- re-run. Needs 008_recipes.sql first.
--
-- Rewards for sharing recipes, designed so points follow quality, not volume:
--   • +5 points each time another member saves your recipe (taken back if
--     they unsave it, so save/unsave can't farm points). Saving your own
--     recipe earns nothing.
--   • +5 bonus, once per recipe, when a recipe with a photo, calories and at
--     least two tags gets saved by someone else.
--   • +25 points when your recipe is the week's featured recipe: the member
--     recipe saved most by others during the previous week (Monday–Sunday, UTC).
-- Points are only ever written by the database. Members can read their own
-- points history but can't add to it. Badges are worked out in the app from
-- these numbers.

-- ── Save counts on recipes ─────────────────────────────────────────────────
-- Saves are private, so the count other members see is kept on the recipe.
-- Only saves by other members count.

alter table public.recipes add column if not exists save_count int not null default 0;

-- New recipes always start at zero saves, whatever the browser sends.
create or replace function public.recipes_reset_save_count()
returns trigger
language plpgsql
as $$
begin
  new.save_count := 0;
  return new;
end;
$$;

drop trigger if exists recipes_reset_save_count on public.recipes;
create trigger recipes_reset_save_count
  before insert on public.recipes
  for each row execute procedure public.recipes_reset_save_count();

-- ── Points history ─────────────────────────────────────────────────────────

create table if not exists public.points_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('recipe_save', 'recipe_complete', 'recipe_featured')),
  points int not null check (points between -1000 and 1000),
  recipe_id uuid references public.recipes (id) on delete cascade,
  -- One award per thing: 'save:<recipe>:<saver>', 'complete:<recipe>', 'featured:<week>'.
  dedupe text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists points_events_user_idx on public.points_events (user_id, created_at desc);

alter table public.points_events enable row level security;

drop policy if exists "points_events readable by owner" on public.points_events;
create policy "points_events readable by owner" on public.points_events
  for select to authenticated
  using (user_id = (select auth.uid()));
-- No insert, update or delete policies: only the functions below write here.

-- ── Featured recipe of the week ────────────────────────────────────────────

create table if not exists public.featured_recipes (
  -- Monday (UTC) of the week the recipe is featured.
  week_start date primary key,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  saves int not null,
  created_at timestamptz not null default now()
);

alter table public.featured_recipes enable row level security;

drop policy if exists "featured_recipes readable by members" on public.featured_recipes;
create policy "featured_recipes readable by members" on public.featured_recipes
  for select to authenticated using (true);

-- ── Awarding points on save and unsave ────────────────────────────────────

create or replace function public.recipe_saves_after_insert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  r public.recipes%rowtype;
begin
  -- Fikko's own recipes are saved by text key and earn nobody points.
  if new.recipe_key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return new;
  end if;
  select * into r from public.recipes where id = new.recipe_key::uuid;
  if not found or r.user_id = new.user_id then
    return new;
  end if;

  update public.recipes set save_count = save_count + 1 where id = r.id;

  if not r.hidden then
    insert into public.points_events (user_id, kind, points, recipe_id, dedupe)
    values (r.user_id, 'recipe_save', 5, r.id, 'save:' || r.id || ':' || new.user_id)
    on conflict (dedupe) do nothing;

    if r.photo_path is not null and r.calories is not null and cardinality(r.tags) >= 2 then
      insert into public.points_events (user_id, kind, points, recipe_id, dedupe)
      values (r.user_id, 'recipe_complete', 5, r.id, 'complete:' || r.id)
      on conflict (dedupe) do nothing;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.recipe_saves_after_delete()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  rid uuid;
  author uuid;
begin
  if old.recipe_key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return old;
  end if;
  rid := old.recipe_key::uuid;
  select user_id into author from public.recipes where id = rid;
  if not found or author = old.user_id then
    return old;
  end if;

  update public.recipes set save_count = greatest(save_count - 1, 0) where id = rid;
  delete from public.points_events where dedupe = 'save:' || rid || ':' || old.user_id;
  return old;
end;
$$;

drop trigger if exists recipe_saves_after_insert on public.recipe_saves;
create trigger recipe_saves_after_insert
  after insert on public.recipe_saves
  for each row execute procedure public.recipe_saves_after_insert();

drop trigger if exists recipe_saves_after_delete on public.recipe_saves;
create trigger recipe_saves_after_delete
  after delete on public.recipe_saves
  for each row execute procedure public.recipe_saves_after_delete();

-- Trigger functions aren't meant to be called directly.
revoke execute on function public.recipe_saves_after_insert() from public, anon, authenticated;
revoke execute on function public.recipe_saves_after_delete() from public, anon, authenticated;

-- ── Picking the week's featured recipe ─────────────────────────────────────
-- Called by the Recipes page. The first call each week picks last week's
-- most-saved recipe (ties go to the older recipe), records it and awards the
-- author; later calls just return it. Returns nothing when last week had no
-- saves by other members.

create or replace function public.current_featured_recipe()
returns table (recipe_id uuid, saves int, week_start date)
language plpgsql
security definer set search_path = public
as $$
#variable_conflict use_column
declare
  this_week date := date_trunc('week', now() at time zone 'utc')::date;
  winner uuid;
  winner_saves int;
  author uuid;
begin
  if not exists (select 1 from public.featured_recipes f where f.week_start = this_week) then
    select r.id, count(*)::int, r.user_id into winner, winner_saves, author
    from public.recipe_saves s
    join public.recipes r on r.id::text = s.recipe_key
    where not r.hidden
      and s.user_id <> r.user_id
      and s.created_at >= (this_week - 7)::timestamp at time zone 'utc'
      and s.created_at <  this_week::timestamp at time zone 'utc'
    group by r.id, r.user_id, r.created_at
    order by count(*) desc, r.created_at asc
    limit 1;

    if winner is not null then
      insert into public.featured_recipes (week_start, recipe_id, saves)
      values (this_week, winner, winner_saves)
      on conflict (week_start) do nothing;

      insert into public.points_events (user_id, kind, points, recipe_id, dedupe)
      values (author, 'recipe_featured', 25, winner, 'featured:' || this_week)
      on conflict (dedupe) do nothing;
    end if;
  end if;

  return query
    select f.recipe_id, f.saves, f.week_start
    from public.featured_recipes f
    join public.recipes r on r.id = f.recipe_id
    where f.week_start = this_week and not r.hidden;
end;
$$;

revoke execute on function public.current_featured_recipe() from public, anon;
grant execute on function public.current_featured_recipe() to authenticated;

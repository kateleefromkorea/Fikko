-- Additive migration — safe to run against the live database, and safe to
-- re-run. Fixes two problems found in testing 009:
--   • A member sharing a recipe could set its save count themselves.
--     New recipes now always start at zero, and every count is recalculated
--     from the real saves in case one was faked.
--   • current_featured_recipe() failed with "week_start is ambiguous".
-- 009_recipe_rewards.sql has the same fixes, for fresh installs.

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

-- Recount saves by other members for every recipe.
update public.recipes r
set save_count = coalesce((
  select count(*) from public.recipe_saves s
  where s.recipe_key = r.id::text and s.user_id <> r.user_id
), 0);

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


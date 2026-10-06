-- AI recipes: ideas from the "Cook with what you have" box on the Recipes page
-- that a member chose to keep. Additive: safe to run on the live database, and
-- safe to re-run.
--   • Private: only the member who saved one can see it. They never appear in
--     the member feed, can't be featured, and earn no recipe points, so they
--     can't be used to farm rewards.
--   • have / buy / swaps: what the member already had, what they'd need to buy,
--     and substitutions ({"instead_of": "...", "use": "..."}), as the AI wrote them.
-- The app loads these in a request of their own, so it keeps working before
-- this has run (the generator just can't save until it has).

create table if not exists public.ai_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 300),
  tags text[] not null default '{}' check (
    tags <@ array['chicken', 'beef', 'pork', 'fish', 'eggs', 'vegetarian', 'vegan',
                  'low-fat', 'high-protein', 'low-carb', 'quick', 'breakfast']
  ),
  contains text[] not null default '{}' check (
    contains <@ array['dairy', 'eggs', 'gluten', 'nuts', 'shellfish', 'soy']
  ),
  art text check (art is null or char_length(art) <= 20),
  ingredients text[] not null check (cardinality(ingredients) between 1 and 40),
  have text[] not null default '{}' check (cardinality(have) <= 40),
  buy text[] not null default '{}' check (cardinality(buy) <= 40),
  swaps jsonb not null default '[]' check (jsonb_typeof(swaps) = 'array' and jsonb_array_length(swaps) <= 20),
  steps text[] not null check (cardinality(steps) between 1 and 30),
  minutes int check (minutes is null or minutes between 1 and 1440),
  servings int check (servings is null or servings between 1 and 50),
  calories int check (calories is null or calories between 0 and 5000),
  protein numeric(6, 1) check (protein is null or protein between 0 and 1000),
  carbs numeric(6, 1) check (carbs is null or carbs between 0 and 1000),
  fat numeric(6, 1) check (fat is null or fat between 0 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists ai_recipes_user_created_idx on public.ai_recipes (user_id, created_at desc);

alter table public.ai_recipes enable row level security;

drop policy if exists "ai_recipes are self-owned" on public.ai_recipes;
create policy "ai_recipes are self-owned" on public.ai_recipes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Recipe generation's AI spend shows on /admin with the other features.
-- Skipped if migration 024 (ai_costs) hasn't been run yet; 024 already allows 'recipe'.
do $$
begin
  if to_regclass('public.ai_costs') is not null then
    alter table public.ai_costs drop constraint if exists ai_costs_feature_check;
    alter table public.ai_costs add constraint ai_costs_feature_check
      check (feature in ('coach', 'coach_screen', 'coach_review', 'voice', 'photo', 'interactions', 'recipe'));
  end if;
end $$;

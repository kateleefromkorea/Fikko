-- Additive migration — safe to run against the live database, and safe to
-- re-run.
--
--   • recipes.contains: allergens a member says their recipe contains. Null
--     means "not listed" (recipes shared before this existed), which the app
--     shows as such rather than assuming the recipe is allergen-free.
--   • Protein, carbs and fat per 100 g on logged food and saved foods, for
--     members who track detailed macros. Null means unknown; older entries
--     simply show no macros.

alter table public.recipes
  add column if not exists contains text[];

alter table public.recipes drop constraint if exists recipes_contains_check;
alter table public.recipes add constraint recipes_contains_check check (
  contains is null
  or contains <@ array['dairy', 'eggs', 'gluten', 'nuts', 'shellfish', 'soy']::text[]
);

alter table public.food_log_items
  add column if not exists protein_per_100g numeric,
  add column if not exists carbs_per_100g numeric,
  add column if not exists fat_per_100g numeric;

alter table public.custom_foods
  add column if not exists protein_per_100g numeric,
  add column if not exists carbs_per_100g numeric,
  add column if not exists fat_per_100g numeric;

-- Per 100 g, no macro can be negative or exceed 100 g.
alter table public.food_log_items drop constraint if exists food_log_items_macros_check;
alter table public.food_log_items add constraint food_log_items_macros_check check (
  (protein_per_100g is null or protein_per_100g between 0 and 100)
  and (carbs_per_100g is null or carbs_per_100g between 0 and 100)
  and (fat_per_100g is null or fat_per_100g between 0 and 100)
);

alter table public.custom_foods drop constraint if exists custom_foods_macros_check;
alter table public.custom_foods add constraint custom_foods_macros_check check (
  (protein_per_100g is null or protein_per_100g between 0 and 100)
  and (carbs_per_100g is null or carbs_per_100g between 0 and 100)
  and (fat_per_100g is null or fat_per_100g between 0 and 100)
);

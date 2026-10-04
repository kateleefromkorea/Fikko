-- Regional food composition data. Additive: safe to run on the live database,
-- and safe to re-run.
--
-- National food composition databases (Australia's AFCD first, then Korea,
-- Singapore, Malaysia and others as each one is licensed) loaded into one
-- table, so the meal log's food search can find dishes USDA doesn't have.
-- Values are per 100 g, like every other food source in Fikko.
--
-- Only the server reads this table (api/food-search.ts, with the service key);
-- members never query it directly. Rows are loaded from CSV files made by
-- scripts/build-regional-foods.mjs, through the Table Editor's CSV import.
-- Each row says which database it came from (source), and the app credits
-- that database as its licence requires (public/food-data-sources.html).

create table if not exists public.regional_foods (
  id bigint generated always as identity primary key,
  -- Which database: 'afcd' (Australia), later 'rda' / 'mfds' (Korea), 'hpb' (Singapore)...
  source text not null,
  -- The food's own id in that database, so re-importing updates rows instead of duplicating them.
  source_id text not null,
  name text not null,
  -- The name in the local language, when the database has one.
  name_local text,
  category text,
  calories_per_100g numeric not null check (calories_per_100g between 0 and 900),
  protein_per_100g numeric check (protein_per_100g between 0 and 100),
  carbs_per_100g numeric check (carbs_per_100g between 0 and 100),
  fat_per_100g numeric check (fat_per_100g between 0 and 100),
  -- What the food search matches against.
  search_text text generated always as (lower(name || ' ' || coalesce(name_local, ''))) stored,
  unique (source, source_id)
);

alter table public.regional_foods enable row level security;
-- No policies and no grants: only the service key (the server) can read or write.
revoke all on public.regional_foods from anon, authenticated;

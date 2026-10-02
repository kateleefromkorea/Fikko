-- Faster food logging: saved meals, and barcodes on members' own foods.
--
-- Additive and safe to re-run.

-- A saved meal is a named list of foods logged together in one tap, e.g.
-- "My usual breakfast". Each item holds what a food log row needs:
-- { name, grams, caloriesPer100g, proteinPer100g?, carbsPer100g?, fatPer100g? }.
create table if not exists public.saved_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 30),
  created_at timestamptz not null default now()
);

create index if not exists saved_meals_user_idx on public.saved_meals (user_id, created_at);

alter table public.saved_meals enable row level security;

drop policy if exists "saved_meals are self-owned" on public.saved_meals;
create policy "saved_meals are self-owned" on public.saved_meals
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- A product scanned but not found in Open Food Facts is added to the member's
-- own foods with its barcode, so scanning it again finds it straight away.
alter table public.custom_foods add column if not exists barcode text
  check (barcode is null or barcode ~ '^[0-9]{8,14}$');

create index if not exists custom_foods_user_barcode_idx on public.custom_foods (user_id, barcode) where barcode is not null;

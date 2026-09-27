-- Additive migration — safe to run against the live database, and safe to
-- re-run. Three kinds of hardening, none of which change or remove data:
--
--   1. Indexes for the per-user lookups the app makes on every visit.
--   2. Row-level security policies rewritten in Supabase's recommended faster
--      form, and restricted to signed-in users.
--   3. Sanity limits on values and text lengths, so a buggy or malicious
--      client can't write absurd numbers or megabytes of text.

-- ── 1. Indexes ─────────────────────────────────────────────────────────────
-- Tables already covered by a unique constraint that starts with user_id
-- (custom_foods) or keyed by user_id (profiles) don't need another one.

create index if not exists habit_entries_user_date_idx        on public.habit_entries (user_id, date);
create index if not exists custom_habits_user_idx             on public.custom_habits (user_id);
create index if not exists custom_habit_entries_user_date_idx on public.custom_habit_entries (user_id, date);
create index if not exists medications_user_idx               on public.medications (user_id);
create index if not exists food_log_items_user_date_idx       on public.food_log_items (user_id, date);

-- ── 2. Row-level security policies ─────────────────────────────────────────
-- Same rule as before: each user can only see and change their own rows.
-- Wrapping auth.uid() in a sub-select lets Postgres evaluate it once per
-- query instead of once per row, which matters as tables grow. "to
-- authenticated" means signed-out requests are refused before the rule runs.

drop policy if exists "profiles are self-owned" on public.profiles;
create policy "profiles are self-owned" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "habit_entries are self-owned" on public.habit_entries;
create policy "habit_entries are self-owned" on public.habit_entries
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "custom_habits are self-owned" on public.custom_habits;
create policy "custom_habits are self-owned" on public.custom_habits
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "custom_habit_entries are self-owned" on public.custom_habit_entries;
create policy "custom_habit_entries are self-owned" on public.custom_habit_entries
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "medications are self-owned" on public.medications;
create policy "medications are self-owned" on public.medications
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "food_log_items are self-owned" on public.food_log_items;
create policy "food_log_items are self-owned" on public.food_log_items
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "custom_foods are self-owned" on public.custom_foods;
create policy "custom_foods are self-owned" on public.custom_foods
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ── 3. Value and length limits ─────────────────────────────────────────────
-- Generous bounds: far outside anything a real person logs, tight enough to
-- reject garbage. Each is dropped first so the migration can be re-run.

alter table public.profiles drop constraint if exists profiles_limits_check;
alter table public.profiles add constraint profiles_limits_check check (
      char_length(name) <= 100
  and (height_cm        is null or height_cm        between 50 and 300)
  and (weight_kg        is null or weight_kg        between 20 and 500)
  and (target_weight_kg is null or target_weight_kg between 20 and 500)
  and (weekly_rate_kg   is null or weekly_rate_kg   between -2 and 2)
  and calorie_goal between 500 and 10000
  and water_goal   between 0 and 50
  and sleep_goal   between 0 and 24
  and (bmr  is null or bmr  between 0 and 10000)
  and (tdee is null or tdee between 0 and 20000)
  and (gender          is null or char_length(gender)          <= 50)
  and (activity_level  is null or char_length(activity_level)  <= 50)
  and (primary_goal    is null or char_length(primary_goal)    <= 50)
  and (dietary_pattern is null or char_length(dietary_pattern) <= 50)
  and (tracking_style  is null or char_length(tracking_style)  <= 50)
  and (wearable        is null or char_length(wearable)        <= 50)
  and coalesce(cardinality(allergies), 0) <= 20
);

alter table public.habit_entries drop constraint if exists habit_entries_limits_check;
alter table public.habit_entries add constraint habit_entries_limits_check check (
  value between 0 and 100000 and (note is null or char_length(note) <= 4000)
);

alter table public.custom_habits drop constraint if exists custom_habits_limits_check;
alter table public.custom_habits add constraint custom_habits_limits_check check (
      char_length(name) between 1 and 100
  and char_length(unit)  <= 30
  and char_length(color) <= 30
  and char_length(icon)  <= 32
  and target between 0 and 100000
);

alter table public.custom_habit_entries drop constraint if exists custom_habit_entries_limits_check;
alter table public.custom_habit_entries add constraint custom_habit_entries_limits_check check (
  value between 0 and 100000
);

alter table public.medications drop constraint if exists medications_limits_check;
alter table public.medications add constraint medications_limits_check check (
  char_length(trim(name)) between 1 and 100
);

alter table public.food_log_items drop constraint if exists food_log_items_limits_check;
alter table public.food_log_items add constraint food_log_items_limits_check check (
      char_length(trim(name)) between 1 and 200
  and grams             between 0 and 10000
  and calories_per_100g between 0 and 10000
  and calories          between 0 and 100000
);

alter table public.custom_foods drop constraint if exists custom_foods_limits_check;
alter table public.custom_foods add constraint custom_foods_limits_check check (
      char_length(trim(name)) between 1 and 200
  and calories_per_100g between 0 and 10000
);

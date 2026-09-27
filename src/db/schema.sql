-- Fikko base schema — FOR A BRAND-NEW, EMPTY SUPABASE PROJECT ONLY.
--
-- ⚠️  NEVER run this against the live database: it DROPS every table and
--     deletes all user data. Changes to production go in migrations/ as
--     additive, re-runnable files instead.
--
-- Fresh setup: run this file, then every file in src/db/migrations/ in
-- numeric order (002, 003, …). This file alone is not the complete schema.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop table if exists public.custom_habit_entries cascade;
drop table if exists public.custom_habits cascade;
drop table if exists public.habit_entries cascade;
drop table if exists public.medications cascade;
drop table if exists public.profiles cascade;
drop type if exists public.habit_category;

-- ── profiles ─────────────────────────────────────────────────────────────
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  date_of_birth date,
  gender text,
  height_cm numeric,
  weight_kg numeric,
  activity_level text,
  calorie_goal numeric not null default 2000,
  water_goal numeric not null default 8,
  sleep_goal numeric not null default 8,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are self-owned" on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Auto-create a blank profile row whenever a new auth user signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── habit_entries (water, medication, food, exercise, sleep, mood) ────────
create type public.habit_category as enum ('water', 'medication', 'food', 'exercise', 'sleep', 'mood');

create table public.habit_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category public.habit_category not null,
  date date not null,
  value numeric not null,
  note text,
  unique (user_id, category, date)
);

alter table public.habit_entries enable row level security;

create policy "habit_entries are self-owned" on public.habit_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── custom_habits + custom_habit_entries ───────────────────────────────────
-- id is client-generated (crypto.randomUUID()) rather than DB-default, so a
-- newly-created habit and its first logged entry can be written together
-- without a round trip to fetch a server-assigned id first.
create table public.custom_habits (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  unit text not null,
  target numeric not null,
  color text not null,
  icon text not null
);

alter table public.custom_habits enable row level security;

create policy "custom_habits are self-owned" on public.custom_habits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.custom_habit_entries (
  id uuid primary key default gen_random_uuid(),
  custom_habit_id uuid not null references public.custom_habits (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  value numeric not null,
  unique (custom_habit_id, date)
);

alter table public.custom_habit_entries enable row level security;

create policy "custom_habit_entries are self-owned" on public.custom_habit_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── medications ─────────────────────────────────────────────────────────
create table public.medications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  time_of_day text not null default 'breakfast' check (time_of_day in ('breakfast', 'midday', 'night'))
);

alter table public.medications enable row level security;

create policy "medications are self-owned" on public.medications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── custom_foods ────────────────────────────────────────────────────────
-- Foods entered manually, saved for reuse in future searches.
create table public.custom_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  calories_per_100g numeric not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.custom_foods enable row level security;

create policy "custom_foods are self-owned" on public.custom_foods
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Additive migration — safe to run against the live database, and safe to
-- re-run. Adds Recipes: recipes members share (with an optional photo),
-- saved recipes, and reports.
--
-- Fikko's own recipes live in the app (src/lib/recipeCatalog.ts), not here.
-- Member recipes follow the same rules as Community posts:
--   • Any signed-in member can read visible recipes; only the author can
--     delete their own. Nobody can edit.
--   • The author's display name is stamped by the database ("Kate L.").
--   • A recipe reported by 3 different members is hidden automatically.
--   • At most 10 new recipes per member per day.
-- Photos go in a private storage bucket, one folder per member, readable by
-- signed-in members only.
--
-- Needs migration 007 first (it reuses community_display_name).

-- ── Tables ─────────────────────────────────────────────────────────────────

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text not null default '',
  title text not null check (char_length(trim(title)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 300),
  tags text[] not null default '{}' check (
    cardinality(tags) <= 12
    and tags <@ array['chicken', 'beef', 'pork', 'fish', 'eggs', 'vegetarian', 'vegan',
                      'low-fat', 'high-protein', 'low-carb', 'quick', 'breakfast']::text[]
  ),
  ingredients text[] not null check (
    cardinality(ingredients) between 1 and 40 and char_length(array_to_string(ingredients, '')) <= 4000
  ),
  steps text[] not null check (
    cardinality(steps) between 1 and 30 and char_length(array_to_string(steps, '')) <= 8000
  ),
  minutes int check (minutes is null or minutes between 1 and 1440),
  servings int check (servings is null or servings between 1 and 50),
  -- Per serving.
  calories int check (calories is null or calories between 0 and 5000),
  photo_path text check (photo_path is null or char_length(photo_path) <= 200),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

-- Saves cover both kinds of recipe, so the key is text: a catalogue id
-- ("fikko-lemon-chicken") or a member recipe's uuid.
create table if not exists public.recipe_saves (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipe_key text not null check (char_length(recipe_key) between 1 and 64),
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_key)
);

create table if not exists public.recipe_reports (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason text check (reason is null or char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  unique (recipe_id, user_id)
);

create index if not exists recipes_feed_idx on public.recipes (created_at desc) where not hidden;
create index if not exists recipes_user_idx on public.recipes (user_id, created_at desc);

-- ── Triggers ───────────────────────────────────────────────────────────────

create or replace function public.recipes_before_insert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  recent int;
begin
  new.user_id := auth.uid();
  new.author_name := public.community_display_name(auth.uid());
  new.created_at := now();
  new.hidden := false;

  -- A photo must sit in the author's own folder, so nobody can point their
  -- recipe at someone else's upload.
  if new.photo_path is not null and split_part(new.photo_path, '/', 1) <> auth.uid()::text then
    raise exception 'That photo doesn''t belong to you.' using errcode = 'P0001';
  end if;

  select count(*) into recent from public.recipes
    where user_id = new.user_id and created_at > now() - interval '1 day';
  if recent >= 10 then
    raise exception 'You''ve shared a lot of recipes today. Try again tomorrow.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists recipes_before_insert on public.recipes;
create trigger recipes_before_insert
  before insert on public.recipes
  for each row execute procedure public.recipes_before_insert();

create or replace function public.recipes_after_report()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (select count(*) from public.recipe_reports where recipe_id = new.recipe_id) >= 3 then
    update public.recipes set hidden = true where id = new.recipe_id;
  end if;
  return new;
end;
$$;

drop trigger if exists recipe_reports_after_insert on public.recipe_reports;
create trigger recipe_reports_after_insert
  after insert on public.recipe_reports
  for each row execute procedure public.recipes_after_report();

-- ── Row-level security ─────────────────────────────────────────────────────

alter table public.recipes        enable row level security;
alter table public.recipe_saves   enable row level security;
alter table public.recipe_reports enable row level security;

drop policy if exists "recipes readable by members" on public.recipes;
create policy "recipes readable by members" on public.recipes
  for select to authenticated
  using (not hidden or user_id = (select auth.uid()));

drop policy if exists "recipes created by author" on public.recipes;
create policy "recipes created by author" on public.recipes
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "recipes deleted by author" on public.recipes;
create policy "recipes deleted by author" on public.recipes
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Saves are private to each member.
drop policy if exists "recipe_saves are self-owned" on public.recipe_saves;
create policy "recipe_saves are self-owned" on public.recipe_saves
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Reports are write-only; review them in the Supabase table editor.
drop policy if exists "recipe_reports filed by self" on public.recipe_reports;
create policy "recipe_reports filed by self" on public.recipe_reports
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ── Photo storage ──────────────────────────────────────────────────────────
-- Private bucket: photos are served through short-lived signed links to
-- signed-in members. 5 MB cap and images only, enforced by Supabase itself.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-photos', 'recipe-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "recipe photos readable by members" on storage.objects;
create policy "recipe photos readable by members" on storage.objects
  for select to authenticated
  using (bucket_id = 'recipe-photos');

drop policy if exists "recipe photos uploaded to own folder" on storage.objects;
create policy "recipe photos uploaded to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "recipe photos deleted by owner" on storage.objects;
create policy "recipe photos deleted by owner" on storage.objects
  for delete to authenticated
  using (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

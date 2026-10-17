-- Import from URL: a member pastes a recipe page's link and Fikko keeps the
-- recipe in their private library, next to the AI recipes they've saved.
-- Additive and safe to re-run. Existing AI recipes are untouched: every new
-- column is nullable or defaults to what they already are ('ai', no source).
--
--   • ai_recipes is the member's private library. `origin` says where a row
--     came from: 'ai' (Cook with what you have) or 'imported' (a web page).
--     Imported recipes stay private, like AI ones, so a blog's recipe is never
--     republished in the member feed.
--   • source_url is the page as the member pasted it (after redirects);
--     source_key is its normalised form, used to spot "you already have this".
--   • ingredient_details keeps each ingredient structured
--     ({raw_text, quantity, unit, name, notes, group}) so nutrition and meal
--     planning can build on it later. `ingredients` still holds the lines
--     as written, which is what the app shows.
--   • contains may now be null, meaning "allergens not listed", as it already
--     does for member recipes. AI recipes keep their lists.
--   • recipe_import_cache: what a page gave us, by normalised URL, so the same
--     link isn't fetched (or sent to the AI) twice. Server-only.

alter table public.ai_recipes
  add column if not exists origin text not null default 'ai',
  add column if not exists source_url text,
  add column if not exists source_key text,
  add column if not exists source_site text,
  add column if not exists source_author text,
  add column if not exists photo_path text,
  add column if not exists prep_minutes int,
  add column if not exists cook_minutes int,
  add column if not exists language text,
  add column if not exists ingredient_details jsonb;

alter table public.ai_recipes alter column contains drop not null;

alter table public.ai_recipes drop constraint if exists ai_recipes_import_check;
alter table public.ai_recipes add constraint ai_recipes_import_check check (
  origin in ('ai', 'imported')
  and (source_url is null or char_length(source_url) <= 2000)
  and (source_key is null or char_length(source_key) <= 2000)
  and (source_site is null or char_length(source_site) <= 200)
  and (source_author is null or char_length(source_author) <= 200)
  and (photo_path is null or char_length(photo_path) <= 200)
  and (prep_minutes is null or prep_minutes between 0 and 1440)
  and (cook_minutes is null or cook_minutes between 0 and 1440)
  and (language is null or char_length(language) <= 20)
  and (ingredient_details is null or (jsonb_typeof(ingredient_details) = 'array' and jsonb_array_length(ingredient_details) <= 80))
  and (origin = 'ai' or source_url is not null)
);

-- Recipe pages list more than AI ideas do. Raised from 40 ingredients and 30
-- steps; every existing row is within the old limits, so within these too.
alter table public.ai_recipes drop constraint if exists ai_recipes_ingredients_check;
alter table public.ai_recipes add constraint ai_recipes_ingredients_check check (cardinality(ingredients) between 1 and 80);
alter table public.ai_recipes drop constraint if exists ai_recipes_steps_check;
alter table public.ai_recipes add constraint ai_recipes_steps_check check (cardinality(steps) between 1 and 50);

-- One copy of a page per member.
create unique index if not exists ai_recipes_user_source_idx
  on public.ai_recipes (user_id, source_key) where source_key is not null;

-- A photo must sit in the member's own folder of recipe-photos (as for member
-- recipes, migration 008), so nobody can point their recipe at someone else's upload.
create or replace function public.ai_recipes_check_photo()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.photo_path is not null and split_part(new.photo_path, '/', 1) <> auth.uid()::text then
    raise exception 'That photo doesn''t belong to you.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists ai_recipes_check_photo on public.ai_recipes;
create trigger ai_recipes_check_photo
  before insert or update of photo_path on public.ai_recipes
  for each row execute procedure public.ai_recipes_check_photo();

-- ── Extraction cache (server-only: RLS on, no policies) ────────────────────

create table if not exists public.recipe_import_cache (
  source_key text primary key check (char_length(source_key) <= 2000),
  -- 'json_ld' | 'microdata' | 'llm': which stage found the recipe.
  stage text not null check (stage in ('json_ld', 'microdata', 'llm')),
  recipe jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.recipe_import_cache enable row level security;

-- Import AI spend shows on /admin with the other features.
alter table public.ai_costs drop constraint if exists ai_costs_feature_check;
alter table public.ai_costs add constraint ai_costs_feature_check
  check (feature in ('coach', 'coach_screen', 'coach_review', 'coach_checkin', 'food_macros', 'voice', 'photo', 'interactions', 'recipe', 'recipe_import'));

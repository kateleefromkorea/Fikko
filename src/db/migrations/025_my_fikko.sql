-- My Fikko: the plant each member grows by completing their habits.
-- Additive: safe to run on the live database, and safe to re-run.
--   fikko_seed: the seed picked in onboarding (or on the My Fikko page by
--     members who joined before it existed). Null until one is picked.
--   fikko_planted_on: the day the current plant was planted. Growth counts
--     complete days from here, and replanting after the plant dies moves it.
--   fikko_pot, fikko_companion: cosmetics chosen on the My Fikko page.
-- Growth, withering and dying are worked out from the habit log in the app
-- (src/lib/fikko.ts), so nothing else is stored.
-- The app saves these in a request of their own, so it keeps working before
-- this has run.

alter table public.profiles add column if not exists fikko_seed text;
alter table public.profiles add column if not exists fikko_planted_on date;
alter table public.profiles add column if not exists fikko_pot text not null default 'clay';
alter table public.profiles add column if not exists fikko_companion text not null default 'none';

alter table public.profiles drop constraint if exists profiles_fikko_check;
alter table public.profiles add constraint profiles_fikko_check check (
      (fikko_seed is null or fikko_seed in ('sprout', 'sunflower', 'tulip', 'blossom', 'lavender', 'lotus'))
  and fikko_pot in ('clay', 'white', 'teal', 'gold')
  and fikko_companion in ('none', 'ladybug', 'butterfly')
);

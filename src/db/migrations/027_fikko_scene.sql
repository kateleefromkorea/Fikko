-- My Fikko scenes: the backdrop drawn behind a member's plant (SCENES in
-- src/lib/fikko.ts), picked on the My Fikko page under Customise.
-- Additive: safe to run on the live database, and safe to re-run.
-- Rain clouds and sunshine need nothing stored: they're worked out from the
-- habit log in the app, like growth.
-- The app saves this in a request of its own, so it keeps working before this
-- has run.

alter table public.profiles add column if not exists fikko_scene text not null default 'plain';

alter table public.profiles drop constraint if exists profiles_fikko_scene_check;
alter table public.profiles add constraint profiles_fikko_scene_check check (
  fikko_scene in ('plain', 'windowsill', 'garden', 'rain', 'night')
);

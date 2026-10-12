-- Real trees are for Max members. Everyone who completes a calendar month
-- still earns the tree in their garden, so api/trees.ts keeps recording every
-- completed month in fikko_trees, but only a member on Max when the month is
-- recorded gets a real tree planted.
-- Additive: safe to run on the live database, and safe to re-run. Needs 037
-- first.
--
-- status:
--   'none'    a garden tree only: the member wasn't on Max (the default, so a
--             row never costs money by accident)
--   'pending' a real tree is owed, not yet planted with the planting partner
--   'planted' planted
-- plan: the member's plan when the month was recorded, kept for the record.
-- While paid plans aren't enforced (plan_settings.enforced, migration 035)
-- everyone counts as Max, so every completed month is 'pending'.

alter table public.fikko_trees add column if not exists plan text
  check (plan is null or plan in ('free', 'premium', 'max'));

alter table public.fikko_trees drop constraint if exists fikko_trees_status_check;
alter table public.fikko_trees add constraint fikko_trees_status_check
  check (status in ('none', 'pending', 'planted'));
alter table public.fikko_trees alter column status set default 'none';

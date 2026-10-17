-- Training-day calorie targets (Max, opt-in). Additive and safe to re-run.
-- Needs 042_adaptive_targets.sql. The maths is in src/lib/trainingDays.ts.

alter table public.adaptive_targets add column if not exists training_days boolean not null default false;

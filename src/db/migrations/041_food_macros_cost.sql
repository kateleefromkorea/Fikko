-- Lets the cost log (ai_costs) record the "fill in missing macros" calls
-- (api/food-macros.ts) as their own feature. Additive and safe to re-run.
-- Until it has run those calls still work; only their cost row isn't saved.

alter table public.ai_costs drop constraint if exists ai_costs_feature_check;
alter table public.ai_costs add constraint ai_costs_feature_check
  check (feature in ('coach', 'coach_screen', 'coach_review', 'coach_checkin', 'food_macros', 'voice', 'photo', 'interactions', 'recipe'));

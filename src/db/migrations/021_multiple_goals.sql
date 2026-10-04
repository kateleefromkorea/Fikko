-- Several goals per member (for example weight loss and better nutrition).
-- Additive: safe to run on the live database, and safe to re-run.
--   goals: every goal picked in onboarding or Profile. primary_goal is kept
--     and still written with the goal that sets the calorie target (weight
--     loss, muscle building or maintenance), or the first pick otherwise.
-- The app saves goals in a request of its own, so it keeps working before
-- this has run; members just keep a single goal until then.

alter table public.profiles add column if not exists goals text[] not null default '{}';

-- Carry existing answers over.
update public.profiles
   set goals = array[primary_goal]
 where primary_goal is not null and cardinality(goals) = 0;

alter table public.profiles drop constraint if exists profiles_goals_check;
alter table public.profiles add constraint profiles_goals_check check (
      cardinality(goals) <= 6
  and char_length(array_to_string(goals, ',')) <= 200
);

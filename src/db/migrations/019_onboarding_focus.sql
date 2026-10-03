-- Onboarding refresh. Additive: safe to run on the live database.
--   dietary_patterns: up to 3 ways of eating (replaces the single
--     dietary_pattern, which is kept and still written with the first one).
--   goal_focus: what a "Better nutrition" or "Condition management" goal is
--     about (more protein, better sleep...), for personalisation and insights.

alter table public.profiles add column if not exists dietary_patterns text[] not null default '{}';
alter table public.profiles add column if not exists goal_focus text[] not null default '{}';

-- Carry existing answers over.
update public.profiles
   set dietary_patterns = array[dietary_pattern]
 where dietary_pattern is not null and cardinality(dietary_patterns) = 0;

alter table public.profiles drop constraint if exists profiles_onboarding_lists_check;
alter table public.profiles add constraint profiles_onboarding_lists_check check (
      cardinality(dietary_patterns) <= 3
  and char_length(array_to_string(dietary_patterns, ',')) <= 200
  and cardinality(goal_focus) <= 10
  and char_length(array_to_string(goal_focus, ',')) <= 200
);

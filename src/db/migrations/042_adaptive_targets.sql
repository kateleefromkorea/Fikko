-- Adaptive calorie targets (Premium): weigh-ins typed in by the member, days
-- they've marked as fully logged, their settings, and every weekly suggestion.
-- Additive and safe to re-run. The maths is in src/lib/adaptiveTdee.ts.

-- ── Weigh-ins ─────────────────────────────────────────────────────────────
-- Typed in by the member. A wearable scale's readings stay in biometric_entries;
-- the app shows both, and the member's own entry wins on the same day.
create table if not exists public.weigh_ins (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  kg numeric(5, 2) not null check (kg between 30 and 300),
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.weigh_ins enable row level security;
revoke all on public.weigh_ins from anon, authenticated;
grant select, insert, update, delete on public.weigh_ins to authenticated;

drop policy if exists "Members manage their weigh-ins" on public.weigh_ins;
create policy "Members manage their weigh-ins" on public.weigh_ins
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ── Fully logged food days ────────────────────────────────────────────────
-- A row means the member said "I logged everything I ate" that day, so the
-- day counts towards their calories in even if it looks light.
create table if not exists public.food_days_complete (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  primary key (user_id, date)
);

alter table public.food_days_complete enable row level security;
revoke all on public.food_days_complete from anon, authenticated;
grant select, insert, delete on public.food_days_complete to authenticated;

drop policy if exists "Members manage their complete days" on public.food_days_complete;
create policy "Members manage their complete days" on public.food_days_complete
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ── Settings ──────────────────────────────────────────────────────────────
create table if not exists public.adaptive_targets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Weekly suggestions on or off.
  enabled boolean not null default true,
  -- Fikko's running estimate of what the member burns a day, updated at each
  -- weekly check whether or not they take the suggestion. Null until the first.
  tdee_estimate numeric,
  -- Apply changes of 100 kcal or less without asking (the member is still told).
  auto_apply_small boolean not null default false,
  -- When Fikko last asked whether to turn that on; it asks at most once a month.
  auto_apply_asked_at timestamptz,
  -- No suggestions until this date (illness, travel, a break).
  paused_until date,
  -- The member's local date of the last weekly check.
  last_checked_on date,
  updated_at timestamptz not null default now()
);

alter table public.adaptive_targets enable row level security;
revoke all on public.adaptive_targets from anon, authenticated;
grant select, insert, update on public.adaptive_targets to authenticated;

drop policy if exists "Members manage their adaptive settings" on public.adaptive_targets;
create policy "Members manage their adaptive settings" on public.adaptive_targets
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ── Suggestions ───────────────────────────────────────────────────────────
-- One row per weekly suggestion, kept so the member can see what changed and why.
create table if not exists public.target_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- pending: waiting for an answer. accepted / kept: the member chose.
  -- auto: applied without asking (small change, auto-apply on). undone: an auto change reversed.
  status text not null default 'pending' check (status in ('pending', 'accepted', 'kept', 'auto', 'undone')),
  previous_kcal int not null check (previous_kcal between 800 and 6000),
  proposed_kcal int not null check (proposed_kcal between 800 and 6000),
  tdee_estimate int not null,
  -- The numbers behind it (trend weights, pace, average eaten, days used), for the explanation.
  evidence jsonb not null default '{}'::jsonb,
  answered_at timestamptz
);

create index if not exists target_suggestions_user_idx on public.target_suggestions (user_id, created_at desc);

alter table public.target_suggestions enable row level security;
revoke all on public.target_suggestions from anon, authenticated;
grant select, insert, update on public.target_suggestions to authenticated;

drop policy if exists "Members manage their suggestions" on public.target_suggestions;
create policy "Members manage their suggestions" on public.target_suggestions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Weekly check-ins from the AI coach (api/coach-checkin.ts): once a week, on
-- Monday morning in the member's time zone, Fikko looks for a pattern in their
-- last four weeks and the coach writes a short note with one small suggestion.
-- It appears in their coach chat. Additive and safe to re-run.
--
--   • coach_messages.kind: 'chat' for the conversation, 'checkin' for these.
--   • coach_messages.read_at: when the member saw a check-in (for the dot on
--     the Coach tab). Members set it through mark_coach_checkins_read().
--   • coach_checkin_settings: on/off and time zone per member. Members manage
--     their own row; last_sent_on is the server's.
--   • coach_checkin_candidates(): who could get one, for the hourly job.

alter table public.coach_messages add column if not exists kind text not null default 'chat';
alter table public.coach_messages drop constraint if exists coach_messages_kind_check;
alter table public.coach_messages add constraint coach_messages_kind_check check (kind in ('chat', 'checkin'));
alter table public.coach_messages add column if not exists read_at timestamptz;

create or replace function public.mark_coach_checkins_read()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.coach_messages
     set read_at = now()
   where user_id = (select auth.uid()) and kind = 'checkin' and read_at is null;
$$;

revoke all on function public.mark_coach_checkins_read() from public, anon;
grant execute on function public.mark_coach_checkins_read() to authenticated;

create table if not exists public.coach_checkin_settings (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  enabled      boolean not null default true,
  time_zone    text not null default 'UTC',
  last_sent_on date,
  updated_at   timestamptz not null default now()
);

alter table public.coach_checkin_settings enable row level security;
revoke all on public.coach_checkin_settings from anon, authenticated;
grant select on public.coach_checkin_settings to authenticated;
-- user_id is needed for upserts; last_sent_on stays server-only.
grant insert (user_id, enabled, time_zone, updated_at) on public.coach_checkin_settings to authenticated;
grant update (user_id, enabled, time_zone, updated_at) on public.coach_checkin_settings to authenticated;

drop policy if exists "coach_checkin_settings owner read" on public.coach_checkin_settings;
create policy "coach_checkin_settings owner read" on public.coach_checkin_settings
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "coach_checkin_settings owner insert" on public.coach_checkin_settings;
create policy "coach_checkin_settings owner insert" on public.coach_checkin_settings
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "coach_checkin_settings owner update" on public.coach_checkin_settings;
create policy "coach_checkin_settings owner update" on public.coach_checkin_settings
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Members who've finished setup, aren't leaving, haven't switched check-ins
-- off, and logged on at least 3 days of the last 14 (enough for a pattern).
-- Consent and plan are checked by the server for each one.
create or replace function public.coach_checkin_candidates()
returns table (user_id uuid, time_zone text, last_sent_on date)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id,
         coalesce(s.time_zone, r.time_zone, 'UTC'),
         s.last_sent_on
  from public.profiles p
  left join public.coach_checkin_settings s on s.user_id = p.user_id
  left join public.reminder_settings r on r.user_id = p.user_id
  where p.onboarding_completed_at is not null
    and p.deletion_scheduled_for is null
    and coalesce(s.enabled, true)
    and (
      select count(distinct e.date) from public.habit_entries e
      where e.user_id = p.user_id and e.value > 0 and e.date >= current_date - 14
    ) >= 3;
$$;

revoke all on function public.coach_checkin_candidates() from public, anon, authenticated;
grant execute on function public.coach_checkin_candidates() to service_role;

-- What the check-ins cost shows on /admin with the other AI features.
alter table public.ai_costs drop constraint if exists ai_costs_feature_check;
alter table public.ai_costs add constraint ai_costs_feature_check
  check (feature in ('coach', 'coach_screen', 'coach_review', 'coach_checkin', 'voice', 'photo', 'interactions', 'recipe'));

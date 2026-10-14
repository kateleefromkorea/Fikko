-- "Your trial ends soon" email. Additive and safe to re-run. Needs 040_plan_trials.sql.
--
-- The hourly job in api/email.ts emails each member once, when 24 hours or less
-- of their free trial are left, unless they've already subscribed. It claims the
-- send by setting ending_email_sent_at first, so two overlapping runs can't both send.

alter table public.plan_trials add column if not exists ending_email_sent_at timestamptz;

-- Trials with 24 hours or less to go, not yet emailed, whose owner hasn't
-- subscribed. Includes the member's reminder time zone (UTC if they have none),
-- so the email can name the end date in their own day. Server only.
create or replace function public.trials_ending_soon()
returns table (user_id uuid, email text, first_name text, ends_at timestamptz, time_zone text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.user_id,
         u.email::text,
         split_part(coalesce(p.name, ''), ' ', 1),
         t.ends_at,
         coalesce(r.time_zone, 'UTC')
  from public.plan_trials t
  join auth.users u on u.id = t.user_id
  left join public.profiles p on p.user_id = t.user_id
  left join public.reminder_settings r on r.user_id = t.user_id
  where t.ending_email_sent_at is null
    and t.ends_at > now()
    and t.ends_at <= now() + interval '24 hours'
    and u.email is not null
    and not exists (
      select 1 from public.subscriptions s
      where s.user_id = t.user_id and s.status in ('active', 'trialing', 'past_due')
    );
$$;

revoke all on function public.trials_ending_soon() from public, anon, authenticated;
grant execute on function public.trials_ending_soon() to service_role;

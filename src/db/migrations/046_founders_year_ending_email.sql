-- "Your founding year ends soon" email, promised in the Terms (#founding-members).
-- Additive and safe to re-run. Needs 030_founding_members.sql and 045.
--
-- The hourly job in api/email.ts emails each founding member once, when 30 days
-- or less of their free year are left, unless they already pay or are an admin.
-- It claims the send by setting year_ending_email_sent_at first, so two
-- overlapping runs can't both send.

alter table public.founding_members add column if not exists year_ending_email_sent_at timestamptz;

-- Founders whose free year (12 months from claimed_at, as in effective_plan)
-- ends within 30 days and who haven't been emailed. Includes the member's
-- reminder time zone (UTC if they have none) so the email names the end date
-- in their own day. Server only.
create or replace function public.founders_year_ending_soon()
returns table (user_id uuid, email text, first_name text, ends_at timestamptz, time_zone text)
language sql
stable
security definer
set search_path = ''
as $$
  select f.user_id,
         u.email::text,
         split_part(coalesce(p.name, ''), ' ', 1),
         f.claimed_at + interval '12 months',
         coalesce(r.time_zone, 'UTC')
  from public.founding_members f
  join auth.users u on u.id = f.user_id
  left join public.profiles p on p.user_id = f.user_id
  left join public.reminder_settings r on r.user_id = f.user_id
  where f.year_ending_email_sent_at is null
    and f.claimed_at + interval '12 months' > now()
    and f.claimed_at + interval '12 months' <= now() + interval '30 days'
    and u.email is not null
    and not exists (select 1 from public.admins a where a.user_id = f.user_id)
    and not exists (
      select 1 from public.subscriptions s
      where s.user_id = f.user_id and s.status in ('active', 'trialing', 'past_due')
    );
$$;

revoke all on function public.founders_year_ending_soon() from public, anon, authenticated;
grant execute on function public.founders_year_ending_soon() to service_role;

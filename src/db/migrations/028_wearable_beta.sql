-- Fitbit & Pixel Watch invite-only beta. Additive: safe to run on the live
-- database, and safe to re-run.
--
-- Until Google verifies Fikko, only Google accounts listed as test users in
-- Google Cloud (up to 100) can connect. Members ask for an invite with the
-- Google account they'll connect; an admin adds that account in Google Cloud,
-- then approves the request on /admin. The server (api/devices.ts) only starts
-- a Fitbit connection for invited members, or members already connected.
--
-- One row per member, written only by the server and the admin functions below.

create table if not exists public.wearable_beta (
  user_id uuid primary key references auth.users (id) on delete cascade,
  provider text not null default 'google' check (provider in ('google')),
  google_email text not null check (char_length(google_email) between 3 and 254),
  status text not null default 'requested' check (status in ('requested', 'invited', 'declined')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz
);

alter table public.wearable_beta enable row level security;
revoke all on public.wearable_beta from anon, authenticated;
grant select on public.wearable_beta to authenticated;

-- Members can see their own request, so the app can show where it stands.
drop policy if exists "Members read their own beta request" on public.wearable_beta;
create policy "Members read their own beta request" on public.wearable_beta
  for select to authenticated using (user_id = (select auth.uid()));

-- Every request for /admin, newest first, with the member's Fikko email (to
-- contact them) and the Google email (to add as a test user). Two-factor
-- required, like admin_stats in migration 017.
create or replace function public.admin_wearable_beta()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.admin_status() <> 'ok' then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', b.user_id,
      'email', u.email,
      'google_email', b.google_email,
      'status', b.status,
      'requested_at', b.requested_at,
      'decided_at', b.decided_at,
      'connected', exists (
        select 1 from public.device_connections c where c.user_id = b.user_id and c.provider = b.provider
      )
    ) order by b.requested_at desc)
    from public.wearable_beta b
    join auth.users u on u.id = b.user_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_wearable_beta() from public, anon;
grant execute on function public.admin_wearable_beta() to authenticated;

-- Approve ('invited'), decline, or put back to 'requested'.
create or replace function public.admin_wearable_beta_decide(p_user uuid, p_status text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if public.admin_status() <> 'ok' then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_status not in ('requested', 'invited', 'declined') then
    raise exception 'Unknown status' using errcode = '22023';
  end if;
  update public.wearable_beta
     set status = p_status,
         decided_at = case when p_status = 'requested' then null else now() end
   where user_id = p_user;
end;
$$;

revoke all on function public.admin_wearable_beta_decide(uuid, text) from public, anon;
grant execute on function public.admin_wearable_beta_decide(uuid, text) to authenticated;

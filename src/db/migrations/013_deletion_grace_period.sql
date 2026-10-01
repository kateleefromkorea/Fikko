-- Additive migration — safe to run against the live database, and safe to
-- re-run. Adds a 30-day grace period to account deletion.
--
--   • profiles.deletion_scheduled_for: when a member asks to delete their
--     account, the server sets this to 30 days out instead of deleting at
--     once. Signing back in before then offers to restore the account
--     (clearing it). A nightly job permanently deletes accounts whose date has
--     passed. Null means the account is active.
--   • account_deletion_feedback: the optional "why are you leaving?" answer.
--     Deliberately has no user id, so it is anonymous and outlives the
--     account. Written only by the server.
--   • While an account is waiting to be deleted, its Community posts,
--     comments and shared recipes are hidden from other members.

alter table public.profiles
  add column if not exists deletion_scheduled_for timestamptz;

create index if not exists profiles_deletion_scheduled_for_idx
  on public.profiles (deletion_scheduled_for)
  where deletion_scheduled_for is not null;

create table if not exists public.account_deletion_feedback (
  id bigint generated always as identity primary key,
  reason text not null,
  details text check (char_length(details) <= 1000),
  created_at timestamptz not null default now()
);

-- RLS on with no policies: only the server's secret key can read or write.
alter table public.account_deletion_feedback enable row level security;

-- Profiles are private to their owner, so other members' policies can't look
-- at them directly. This answers just the one yes/no question they need.
create or replace function public.is_active_member(uid uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select not exists (
    select 1 from public.profiles
    where user_id = uid and deletion_scheduled_for is not null
  );
$$;

revoke all on function public.is_active_member(uuid) from public;
grant execute on function public.is_active_member(uuid) to authenticated;

drop policy if exists "community_posts readable by members" on public.community_posts;
create policy "community_posts readable by members" on public.community_posts
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (not hidden and public.is_active_member(user_id))
  );

drop policy if exists "community_comments readable by members" on public.community_comments;
create policy "community_comments readable by members" on public.community_comments
  for select to authenticated
  using (
    (user_id = (select auth.uid()) or public.is_active_member(user_id))
    and exists (
      select 1 from public.community_posts p
      where p.id = post_id
        and (p.user_id = (select auth.uid()) or (not p.hidden and public.is_active_member(p.user_id)))
    )
  );

drop policy if exists "recipes readable by members" on public.recipes;
create policy "recipes readable by members" on public.recipes
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (not hidden and public.is_active_member(user_id))
  );

-- Security Advisor: functions in the public schema can be called over the API.
-- Two of them never needed to be:
--   * is_active_member is only used inside row-level security policies, so it
--     moves to a "private" schema the API doesn't expose.
--   * is_admin is only called from inside the admin_* functions, which run as
--     their owner, so signed-in members don't need to execute it.
-- Same access rules as before. Additive and safe to re-run. Run it after 047.

create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.is_active_member(uid uuid)
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

revoke all on function private.is_active_member(uuid) from public, anon;
grant execute on function private.is_active_member(uuid) to authenticated;

drop policy if exists "community_posts readable by members" on public.community_posts;
create policy "community_posts readable by members" on public.community_posts
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (not hidden and private.is_active_member(user_id))
  );

drop policy if exists "community_comments readable by members" on public.community_comments;
create policy "community_comments readable by members" on public.community_comments
  for select to authenticated
  using (
    (user_id = (select auth.uid()) or private.is_active_member(user_id))
    and exists (
      select 1 from public.community_posts p
      where p.id = post_id
        and (p.user_id = (select auth.uid()) or (not p.hidden and private.is_active_member(p.user_id)))
    )
  );

drop policy if exists "recipes readable by members" on public.recipes;
create policy "recipes readable by members" on public.recipes
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (not hidden and private.is_active_member(user_id))
  );

drop function if exists public.is_active_member(uuid);

revoke execute on function public.is_admin() from authenticated;

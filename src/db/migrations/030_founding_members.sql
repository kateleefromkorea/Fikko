-- Founding members: the first 100 members to confirm their email and finish
-- setup get Premium free for 12 months once paid plans launch (see the Terms,
-- /terms.html#founding-members). Additive: safe to run on the live database,
-- and safe to re-run.
--
-- A place is claimed automatically, in the database, the moment a member's
-- profile is marked as set up, so it can't be skipped or claimed twice.
-- Admin accounts never take a place. Places are numbered 1 to 100; when a
-- founder's account is finally deleted their row goes with it and the lowest
-- free number goes to the next member to finish setup.
--
-- Members who finished setup before this migration don't get a place
-- automatically. To give one to a beta tester by hand:
--   select public.grant_founding_place('<their user id>');

create table if not exists public.founding_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  place integer not null unique check (place between 1 and 100),
  claimed_at timestamptz not null default now(),
  -- When the welcome email went out (api/email.ts), so it's sent only once.
  welcome_sent_at timestamptz
);

alter table public.founding_members enable row level security;
revoke all on public.founding_members from anon, authenticated;
grant select on public.founding_members to authenticated;

drop policy if exists "Members read their own founding place" on public.founding_members;
create policy "Members read their own founding place" on public.founding_members
  for select to authenticated using (user_id = (select auth.uid()));

/** The offer's size. Keep in step with FOUNDING_PLACES in src/lib/founding.ts. */
create or replace function public.founding_places_total()
returns integer language sql immutable set search_path = '' as $$ select 100 $$;

-- Gives this member the lowest free place, if there is one and they qualify.
-- Returns their place, or null. Safe to call more than once.
create or replace function public.grant_founding_place(p_user uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  existing integer;
  free_place integer;
begin
  select place into existing from public.founding_members where user_id = p_user;
  if existing is not null then
    return existing;
  end if;
  if exists (select 1 from public.admins where user_id = p_user) then
    return null;
  end if;
  if not exists (select 1 from auth.users where id = p_user and email_confirmed_at is not null) then
    return null;
  end if;

  -- One claim at a time, so two members finishing together can't get the same place.
  perform pg_advisory_xact_lock(hashtext('fikko_founding_places'));
  select min(n) into free_place
    from generate_series(1, public.founding_places_total()) n
   where not exists (select 1 from public.founding_members f where f.place = n);
  if free_place is null then
    return null;
  end if;

  insert into public.founding_members (user_id, place) values (p_user, free_place)
  on conflict (user_id) do nothing;
  return (select place from public.founding_members where user_id = p_user);
end;
$$;

-- Only the server, the trigger below and the SQL editor may grant places.
revoke all on function public.grant_founding_place(uuid) from public, anon, authenticated;

create or replace function public.claim_founding_place_on_setup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.onboarding_completed_at is not null
     and (tg_op = 'INSERT' or old.onboarding_completed_at is null) then
    perform public.grant_founding_place(new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists claim_founding_place on public.profiles;
create trigger claim_founding_place
  after insert or update of onboarding_completed_at on public.profiles
  for each row execute function public.claim_founding_place_on_setup();

-- Places still free, for the sign-up screen and the marketing site. A single
-- number, so it's safe to show to anyone.
create or replace function public.founding_places_left()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0, public.founding_places_total() - (select count(*)::integer from public.founding_members));
$$;

revoke all on function public.founding_places_left() from public;
grant execute on function public.founding_places_left() to anon, authenticated;

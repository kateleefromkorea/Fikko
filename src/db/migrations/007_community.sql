-- Additive migration — safe to run against the live database, and safe to
-- re-run. Adds the Community feed: posts, comments, cheers (likes) and reports.
--
-- Unlike every other table, community content is visible to other members,
-- so the rules here are deliberately stricter:
--   • Any signed-in member can read visible posts and comments; only the
--     author can delete their own. Nobody can edit (keeps threads honest).
--   • The author's display name is filled in by the database from their
--     profile ("Kate L."), never sent by the browser, so it can't be spoofed
--     and full names aren't exposed.
--   • A post reported by 3 different members is hidden automatically.
--   • Per-user rate limits stop one account flooding the feed.

-- ── Tables ─────────────────────────────────────────────────────────────────

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text not null default '',
  topic text not null check (topic in ('win', 'question', 'tip', 'motivation')),
  body text not null check (char_length(trim(body)) between 1 and 1000),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text not null default '',
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create table if not exists public.community_cheers (
  post_id uuid not null references public.community_posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason text check (reason is null or char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create index if not exists community_posts_feed_idx     on public.community_posts (created_at desc) where not hidden;
create index if not exists community_posts_user_idx     on public.community_posts (user_id, created_at desc);
create index if not exists community_comments_post_idx  on public.community_comments (post_id, created_at);
create index if not exists community_comments_user_idx  on public.community_comments (user_id, created_at desc);
create index if not exists community_cheers_user_idx    on public.community_cheers (user_id);

-- ── Author names: set by the database, not the client ─────────────────────
-- "Kate Lee" → "Kate L."; an empty profile name → "Fikko member".

create or replace function public.community_display_name(uid uuid)
returns text
language plpgsql
stable
security definer set search_path = public
as $$
declare
  full_name text;
  parts text[];
begin
  select trim(name) into full_name from public.profiles where user_id = uid;
  if full_name is null or full_name = '' then
    return 'Fikko member';
  end if;
  parts := regexp_split_to_array(full_name, '\s+');
  if array_length(parts, 1) = 1 then
    return left(parts[1], 40);
  end if;
  return left(parts[1], 40) || ' ' || upper(left(parts[array_length(parts, 1)], 1)) || '.';
end;
$$;

-- Only the triggers below may call this. Without the revoke, any member could
-- call it through the API with someone else's id to look up their name.
revoke execute on function public.community_display_name(uuid) from public, anon, authenticated;

-- Runs before insert: stamps the real author and name, and rate-limits.
create or replace function public.community_before_insert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  recent int;
begin
  new.user_id := auth.uid();
  new.author_name := public.community_display_name(auth.uid());
  new.created_at := now();

  if tg_table_name = 'community_posts' then
    new.hidden := false;
    select count(*) into recent from public.community_posts
      where user_id = new.user_id and created_at > now() - interval '1 hour';
    if recent >= 10 then
      raise exception 'You''ve posted a lot in the last hour. Take a breather and try again later.'
        using errcode = 'P0001';
    end if;
  else
    select count(*) into recent from public.community_comments
      where user_id = new.user_id and created_at > now() - interval '1 hour';
    if recent >= 60 then
      raise exception 'You''ve commented a lot in the last hour. Try again a little later.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists community_posts_before_insert on public.community_posts;
create trigger community_posts_before_insert
  before insert on public.community_posts
  for each row execute procedure public.community_before_insert();

drop trigger if exists community_comments_before_insert on public.community_comments;
create trigger community_comments_before_insert
  before insert on public.community_comments
  for each row execute procedure public.community_before_insert();

-- Hide a post once 3 different members have reported it. Visible again only
-- if you clear hidden = false yourself in the Supabase table editor.
create or replace function public.community_after_report()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (select count(*) from public.community_reports where post_id = new.post_id) >= 3 then
    update public.community_posts set hidden = true where id = new.post_id;
  end if;
  return new;
end;
$$;

drop trigger if exists community_reports_after_insert on public.community_reports;
create trigger community_reports_after_insert
  after insert on public.community_reports
  for each row execute procedure public.community_after_report();

-- ── Row-level security ─────────────────────────────────────────────────────

alter table public.community_posts    enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_cheers   enable row level security;
alter table public.community_reports  enable row level security;

-- Posts: members see visible posts (and their own, even if hidden).
drop policy if exists "community_posts readable by members" on public.community_posts;
create policy "community_posts readable by members" on public.community_posts
  for select to authenticated
  using (not hidden or user_id = (select auth.uid()));

drop policy if exists "community_posts created by author" on public.community_posts;
create policy "community_posts created by author" on public.community_posts
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "community_posts deleted by author" on public.community_posts;
create policy "community_posts deleted by author" on public.community_posts
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Comments: readable when their post is readable.
drop policy if exists "community_comments readable by members" on public.community_comments;
create policy "community_comments readable by members" on public.community_comments
  for select to authenticated
  using (exists (
    select 1 from public.community_posts p
    where p.id = post_id and (not p.hidden or p.user_id = (select auth.uid()))
  ));

drop policy if exists "community_comments created by author" on public.community_comments;
create policy "community_comments created by author" on public.community_comments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.community_posts p where p.id = post_id and not p.hidden)
  );

drop policy if exists "community_comments deleted by author" on public.community_comments;
create policy "community_comments deleted by author" on public.community_comments
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Cheers: counts are public to members; you can only add or remove your own.
drop policy if exists "community_cheers readable by members" on public.community_cheers;
create policy "community_cheers readable by members" on public.community_cheers
  for select to authenticated using (true);

drop policy if exists "community_cheers given by self" on public.community_cheers;
create policy "community_cheers given by self" on public.community_cheers
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.community_posts p where p.id = post_id and not p.hidden)
  );

drop policy if exists "community_cheers removed by self" on public.community_cheers;
create policy "community_cheers removed by self" on public.community_cheers
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Reports: write-only. Members can file one per post but never read reports;
-- you review them in the Supabase table editor.
drop policy if exists "community_reports filed by self" on public.community_reports;
create policy "community_reports filed by self" on public.community_reports
  for insert to authenticated
  with check (user_id = (select auth.uid()));

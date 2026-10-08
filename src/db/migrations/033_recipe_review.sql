-- Recipe review: recipes members share wait for an admin to approve them
-- before other members can see them. Reviewed on /admin → Recipe review.
--
-- Additive and safe to re-run. Recipes already shared count as approved.
--
-- How it works:
--   • A new recipe starts 'pending' and hidden. Its author still sees it, with
--     a "Waiting for review" label (the existing read policy already lets
--     authors see their own hidden recipes).
--   • Approving un-hides it. Rejecting keeps it hidden, and the author sees
--     the note saying why, so they can delete it and share a better one.
--   • Because a pending recipe is hidden, the existing rules already keep it
--     out of the feed, out of the featured recipe, and from earning points.
--   • An approved recipe that gets reported comes back to the review list.
--     (3 reports still hide it automatically, as before.) Approving it again
--     clears it from the list until someone reports it again.
--   • Members still can't edit recipes, so nobody can approve their own.

alter table public.recipes
  add column if not exists review_status text not null default 'approved'
    check (review_status in ('pending', 'approved', 'rejected')),
  add column if not exists review_note text check (review_note is null or char_length(review_note) <= 300),
  add column if not exists reviewed_at timestamptz;

-- Rows that existed before this migration were filled in as 'approved' above;
-- from now on new rows start pending (the trigger below enforces it too).
alter table public.recipes alter column review_status set default 'pending';

create index if not exists recipes_review_idx on public.recipes (created_at) where review_status = 'pending';

-- Runs after recipes_before_insert (triggers fire in name order), which
-- un-hides every new recipe, so this has the last word.
create or replace function public.recipes_review_on_insert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.review_status := 'pending';
  new.review_note := null;
  new.reviewed_at := null;
  new.hidden := true;
  return new;
end;
$$;

drop trigger if exists recipes_review_on_insert on public.recipes;
create trigger recipes_review_on_insert
  before insert on public.recipes
  for each row execute procedure public.recipes_review_on_insert();

-- ── Admin ──────────────────────────────────────────────────────────────────

-- The review list: pending recipes (oldest first), approved recipes reported
-- since they were last reviewed, and the last 20 decisions so a mistake can be
-- undone. Two-factor required, like the rest of /admin (migration 017).
create or replace function public.admin_recipe_queue()
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

  return jsonb_build_object(
    'queue', coalesce((
      select jsonb_agg(public.admin_recipe_json(r) order by r.review_status desc, r.created_at)
      from public.recipes r
      where r.review_status = 'pending'
         or (r.review_status = 'approved' and exists (
               select 1 from public.recipe_reports rr
               where rr.recipe_id = r.id and rr.created_at > coalesce(r.reviewed_at, '-infinity')))
    ), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(x.j order by x.reviewed_at desc)
      from (
        select public.admin_recipe_json(r) as j, r.reviewed_at
        from public.recipes r
        where r.reviewed_at is not null
        order by r.reviewed_at desc
        limit 20
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

-- One recipe as the review page shows it. Only called from admin functions.
create or replace function public.admin_recipe_json(r public.recipes)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id,
    'title', r.title,
    'description', r.description,
    'tags', r.tags,
    'contains', r.contains,
    'ingredients', r.ingredients,
    'steps', r.steps,
    'minutes', r.minutes,
    'servings', r.servings,
    'calories', r.calories,
    'photo_path', r.photo_path,
    'author_name', r.author_name,
    'author_email', (select u.email from auth.users u where u.id = r.user_id),
    'author_approved', (select count(*) from public.recipes o where o.user_id = r.user_id and o.review_status = 'approved'),
    'created_at', r.created_at,
    'review_status', r.review_status,
    'review_note', r.review_note,
    'reviewed_at', r.reviewed_at,
    'hidden', r.hidden,
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object('reason', rr.reason, 'created_at', rr.created_at) order by rr.created_at desc)
      from public.recipe_reports rr where rr.recipe_id = r.id
    ), '[]'::jsonb)
  );
$$;

-- p_decision: 'approve' or 'reject'. A note is shown to the author on rejection.
create or replace function public.admin_recipe_decide(p_recipe uuid, p_decision text, p_note text default null)
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
  if p_decision not in ('approve', 'reject') then
    raise exception 'Unknown decision' using errcode = '22023';
  end if;

  update public.recipes
     set review_status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
         hidden = (p_decision = 'reject'),
         review_note = case when p_decision = 'reject' then nullif(left(trim(coalesce(p_note, '')), 300), '') end,
         reviewed_at = now()
   where id = p_recipe;
end;
$$;

revoke all on function public.admin_recipe_json(public.recipes) from public, anon, authenticated;
revoke all on function public.admin_recipe_queue() from public, anon;
grant execute on function public.admin_recipe_queue() to authenticated;
revoke all on function public.admin_recipe_decide(uuid, text, text) from public, anon;
grant execute on function public.admin_recipe_decide(uuid, text, text) to authenticated;

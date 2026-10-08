-- Hidden recent foods: foods a member has removed from the Recent list in the
-- meal log. Only the list changes; their past food_log_items stay, so old
-- days keep their totals. Logging the food again removes its row here.
--
-- Additive and safe to re-run.

create table if not exists public.hidden_recent_foods (
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200), -- lowercased
  hidden_at timestamptz not null default now(),
  primary key (user_id, name)
);

alter table public.hidden_recent_foods enable row level security;

drop policy if exists "hidden_recent_foods own rows" on public.hidden_recent_foods;
create policy "hidden_recent_foods own rows" on public.hidden_recent_foods
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

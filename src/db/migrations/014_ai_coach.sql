-- AI coach conversations.
--
-- Additive and safe to re-run. Members can read and clear their own chat;
-- only the server (api/coach.ts, with the secret key) adds messages, so the
-- daily message limit can't be bypassed from the browser.

create table if not exists public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 8000),
  created_at timestamptz not null default now()
);

create index if not exists coach_messages_user_created_idx on public.coach_messages (user_id, created_at);

alter table public.coach_messages enable row level security;

revoke insert, update on public.coach_messages from anon, authenticated;
grant select, delete on public.coach_messages to authenticated;

drop policy if exists "coach_messages readable by owner" on public.coach_messages;
create policy "coach_messages readable by owner" on public.coach_messages
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "coach_messages clearable by owner" on public.coach_messages;
create policy "coach_messages clearable by owner" on public.coach_messages
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- One row per message a member sends, kept separately so clearing the chat
-- doesn't reset the daily limit. Members can read their own; only the server writes.
create table if not exists public.coach_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists coach_usage_user_created_idx on public.coach_usage (user_id, created_at);

alter table public.coach_usage enable row level security;

revoke insert, update, delete on public.coach_usage from anon, authenticated;
grant select on public.coach_usage to authenticated;

drop policy if exists "coach_usage readable by owner" on public.coach_usage;
create policy "coach_usage readable by owner" on public.coach_usage
  for select to authenticated
  using (user_id = (select auth.uid()));

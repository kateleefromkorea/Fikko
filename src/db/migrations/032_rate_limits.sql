-- Rate limits for the API (api/_lib/rateLimit.ts).
--
-- One counter per key per time window, for example "food:<user id>" for the
-- current minute. rate_limit() adds a hit and says whether the key is still
-- within its limit. Only the server (service role) can call it; members and
-- visitors can't read or change the counters.
--
-- Old windows are cleared now and then by rate_limit() itself, so the table
-- stays small without a cron.

create table if not exists public.rate_limits (
  key          text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (key, window_start)
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

create or replace function public.rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n integer;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, w, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning r.hits into n;

  -- About one call in a hundred sweeps away windows older than a day.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return n <= p_max;
end;
$$;

revoke execute on function public.rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit(text, integer, integer) to service_role;

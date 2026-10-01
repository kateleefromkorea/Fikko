-- Additive migration — safe to run against the live database, and safe to
-- re-run. Adds wearable sync: Oura, and Fitbit / Pixel Watch through the
-- Google Health API.
--
--   • device_connections: one row per member per connected provider. Holds
--     the provider's access and refresh tokens, which only the server (with
--     the secret key) can read. Members can see their own connection's
--     status but never the tokens.
--   • oauth_states: short-lived records that tie a "Connect" click to the
--     provider's redirect back, so the callback can't be forged. Server only.
--   • biometric_entries: one value per member, metric, day and source
--     (e.g. resting heart rate from Oura on 1 Oct). Written only by the
--     server's sync; members can read their own.

create table if not exists public.device_connections (
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scopes text,
  status text not null default 'active' check (status in ('active', 'error')),
  last_error text,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  primary key (user_id, provider)
);

-- Kept as a separate constraint so adding a provider later is a re-runnable change.
alter table public.device_connections drop constraint if exists device_connections_provider_check;
alter table public.device_connections add constraint device_connections_provider_check
  check (provider in ('oura', 'google'));

create table if not exists public.oauth_states (
  state text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  code_verifier text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.biometric_entries (
  user_id uuid not null references auth.users (id) on delete cascade,
  metric text not null check (metric in (
    'heartRate', 'hrv', 'spo2', 'respiratoryRate', 'bodyTemp', 'steps', 'activeCalories',
    'vo2max', 'standHours', 'sleepRem', 'sleepDeep', 'sleepCore', 'recoveryScore', 'stressScore', 'weight'
  )),
  date date not null,
  value numeric not null,
  source text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, metric, date, source)
);

create index if not exists biometric_entries_user_date_idx on public.biometric_entries (user_id, date);

alter table public.device_connections enable row level security;
alter table public.oauth_states       enable row level security;
alter table public.biometric_entries  enable row level security;

-- Connections: members may read their own row, but only the non-secret
-- columns. Column privileges keep the tokens out of reach even of the owner.
revoke all on public.device_connections from anon, authenticated;
grant select (user_id, provider, status, last_error, connected_at, last_synced_at)
  on public.device_connections to authenticated;

drop policy if exists "device_connections readable by owner" on public.device_connections;
create policy "device_connections readable by owner" on public.device_connections
  for select to authenticated
  using (user_id = (select auth.uid()));

-- OAuth states: no policies and no grants, so only the server can use them.
revoke all on public.oauth_states from anon, authenticated;

-- Synced readings: members read their own; only the server writes.
revoke insert, update, delete on public.biometric_entries from anon, authenticated;

drop policy if exists "biometric_entries readable by owner" on public.biometric_entries;
create policy "biometric_entries readable by owner" on public.biometric_entries
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Privacy consents. Additive: safe to run on the live database, and safe to
-- re-run.
--
-- Every consent a member gives or withdraws is one row, so the table is a
-- record of exactly what they agreed to, when, under which version of the
-- Privacy Policy and which country's notice. The latest row per consent_key is
-- the member's current choice.
--
-- Rows are written only by the server (/api/consent), which takes the country
-- from the request rather than trusting the app. Members can read their own.
--
--   terms              14+ and agrees to the Terms and Privacy Policy (required)
--   personal_info      collection and use of personal information (required)
--   health_data        collection and use of health information (required)
--   overseas_transfer  storage and hosting outside Korea (required)
--   ai_processing      sending data to Anthropic for the AI features (optional)

create table if not exists public.consent_records (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  consent_key text not null
    check (consent_key in ('terms', 'personal_info', 'health_data', 'overseas_transfer', 'ai_processing')),
  granted boolean not null,
  policy_version text not null check (char_length(policy_version) <= 20),
  region text not null check (region in ('KR', 'AU', 'SG', 'US', 'OTHER')),
  -- Two-letter country the request came from, as detected by the host.
  country text check (char_length(country) <= 2),
  created_at timestamptz not null default now()
);

create index if not exists consent_records_user_idx
  on public.consent_records (user_id, consent_key, created_at desc);

alter table public.consent_records enable row level security;

drop policy if exists "consent records are readable by their owner" on public.consent_records;
create policy "consent records are readable by their owner" on public.consent_records
  for select using (auth.uid() = user_id);
-- No insert, update or delete policies: only the server writes, and never edits.

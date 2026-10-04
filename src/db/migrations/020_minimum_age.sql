-- Minimum age of 14. Additive: safe to run on the live database, and safe to
-- re-run.
--
-- Korea's PIPA needs a guardian's consent to collect data from anyone under
-- 14, so Fikko is 14+. The app already blocks younger birth dates in
-- onboarding and Profile (LIMITS.age in src/lib/metabolics.ts); this enforces
-- it in the database too, so a direct API call can't get around it.
--
-- A trigger rather than a check constraint, because the rule depends on
-- today's date, and only when date_of_birth is set or changed, so existing
-- rows never fail an unrelated update. The cut-off allows one extra day so a
-- member whose local date is ahead of UTC (e.g. Korea, Australia) isn't
-- turned away on their 14th birthday.

create or replace function public.enforce_minimum_age()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.date_of_birth is not null
     and (tg_op = 'INSERT' or new.date_of_birth is distinct from old.date_of_birth)
     and new.date_of_birth > (current_date + 1 - interval '14 years')::date then
    raise exception 'Fikko is for people aged 14 and over.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_minimum_age on public.profiles;
create trigger profiles_minimum_age
  before insert or update of date_of_birth on public.profiles
  for each row execute function public.enforce_minimum_age();

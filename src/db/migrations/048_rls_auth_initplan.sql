-- Performance Advisor: two policies call auth.uid() once per row. Wrapping it
-- in (select ...) makes Postgres evaluate it once per query. Same access rules
-- as before. Additive and safe to re-run.

drop policy if exists "hidden_recent_foods own rows" on public.hidden_recent_foods;
create policy "hidden_recent_foods own rows" on public.hidden_recent_foods
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "consent records are readable by their owner" on public.consent_records;
create policy "consent records are readable by their owner" on public.consent_records
  for select using ((select auth.uid()) = user_id);

-- Clears the Supabase Security Advisor warnings that don't need a design
-- change. Additive and safe to re-run.
--
-- 1. Trigger functions run when their trigger fires; nobody needs to be able
--    to call them over the API. Postgres checks EXECUTE only when a trigger is
--    created, so removing it doesn't stop the triggers firing.
-- 2. is_active_member was only revoked from public, so anon still held the
--    grant Supabase adds by default. Only signed-in members use it (in policies).
-- 3. recipes_reset_save_count had no fixed search path.
--
-- Left as they are on purpose: founding_places_left (the sign-up page shows
-- places left to people who aren't signed in) and the functions the app calls
-- as a signed-in member (admin_*, my_plan, start_trial, harvest_fikko, ...),
-- which check who is calling inside.

revoke all on function public.ai_recipes_check_photo() from public, anon, authenticated;
revoke all on function public.claim_founding_place_on_setup() from public, anon, authenticated;
revoke all on function public.community_after_report() from public, anon, authenticated;
revoke all on function public.community_before_insert() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.limit_custom_habits() from public, anon, authenticated;
revoke all on function public.recipes_after_report() from public, anon, authenticated;
revoke all on function public.recipes_before_insert() from public, anon, authenticated;
revoke all on function public.recipes_review_on_insert() from public, anon, authenticated;
revoke all on function public.recipes_reset_save_count() from public, anon, authenticated;

revoke all on function public.is_active_member(uuid) from anon;

alter function public.recipes_reset_save_count() set search_path = '';

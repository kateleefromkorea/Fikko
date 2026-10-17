# Move the database and API to the US

Decided 2026-10-17: Fikko launches in the US first, so the database and the API move from Singapore to **US East (N. Virginia)**. Supabase `us-east-1` and Vercel `iad1` sit next to each other, so each request needs one short hop instead of crossing the Pacific.

Supabase can't change a project's region in place. The move is a **new project** in the US, then switching Fikko over to it. Do it before the private beta (20 Oct) while there is little real data. Allow a morning.

## Already done in the code (2026-10-17, not committed or deployed)
- [x] `vercel.json`: `"regions": ["iad1"]` so the API runs in Virginia
- [x] `public/privacy.html`, `public/privacy-ko.html` and `src/lib/consent.ts` now say the database is in the United States
- [x] `docs/launch/google-verification.md` and `lawyer-brief.md` say US East / United States
- Leave these uncommitted until step 7. The policies must not say "United States" while the live database is still in Singapore.

## Steps (you)
1. **New project.** Supabase → New project in the Fikko organisation, region **East US (North Virginia)**, Pro plan. Save the database password in your password manager.
2. **Build the schema.** SQL editor: run `src/db/schema.sql`, then every file in `src/db/migrations/` in number order (001 → 046). Where two files share a number (024, 026, 041), run both. Then run `docs/launch/check-migrations.sql` (after Claude extends it to 046); it must say All good.
3. **Copy the Auth settings from the old project.** Authentication → Providers → Google (client ID and secret, skip nonce checks if the old one did), URL Configuration (Site URL `https://app.fikko.io`, the same redirect URLs), Email templates (Confirm, Reset, Magic link, Change email, Invite), Attack Protection (Turnstile secret key), Rate limits (emails per hour 100), password rules, email confirmation on, leaked-password protection on, MFA on the dashboard login.
4. **Collect new values.** Project URL, anon key, secret key (Settings → API).
5. **Google Cloud.** In the Web application OAuth client, add the new project's `https://<new-ref>.supabase.co/auth/v1/callback` as an authorised redirect URI. Keep the old one until cutover. If you set up `auth.fikko.io` (Option B), point it at the **new** project instead and skip this.
6. **Test on a Vercel preview first.** Create a Preview environment with the four Supabase variables below pointing at the new project, deploy this branch, and test sign-up, Google sign-in, logging a meal, reminders, delete account, export.
7. **Cutover (pick a quiet hour).**
   - Vercel → Settings → Environment Variables, Production: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY` = new project values. Keep `TOKEN_ENCRYPTION_KEY` the same.
   - Claude changes the project address in the `connect-src`, `img-src` and `wss://` entries of the content policy in `vercel.json` (it names the old project, `tpyqnikdbztzgxtiprpu`), and commits with the policy changes above.
   - Deploy. Check `x-vercel-id` on an API response shows `iad1`.
8. **Data.** Only test accounts exist in the old project, so nothing needs copying except your own admin account and any real testers. Recreate your admin user in the new project, then run the admin migration steps (admin flag, MFA enrolment). For real testers, ask them to sign up again.
9. **Retire the old project.** Keep it paused for two weeks, then delete it. Remove its Google redirect URI.
10. **Re-run the checks:** migration check, cron jobs return 200 (Vercel → Cron Jobs), founding counter at zero, reminder email arrives, Fitbit invite flow, and a Lighthouse run from a US location.

## Documents to touch afterwards
- Tell counsel the data now sits in the US; the Korean overseas-transfer table lists the United States for Supabase, Vercel and Anthropic, and Australian members' notice says United States (APP 8).
- Backup length: confirm Supabase's real backup window in the new project and make the policy match (still says 7 days).
- Google verification form: submit with the US wording in the app description.

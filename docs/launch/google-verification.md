# Google Health API verification pack

Everything to paste into Google Cloud Console → **Google Auth Platform** (OAuth consent screen) and the verification form. Prepared 2026-10-06. Source of truth for what Fikko reads: `api/_lib/google.ts` (`SCOPES`, `toReadings`).

## 0. Before you submit (owner actions)
1. Make **hello@fikko.io** an Owner of the Google Cloud project (IAM → Grant access → Owner).
2. Verify **fikko.io** in Google Search Console (DNS TXT record at your registrar), signed in as an Owner of the Cloud project.
3. Make sure https://www.fikko.io, /privacy.html and /terms.html load without sign-in. ✅ checked 2026-10-06.

## 1. Branding (OAuth consent screen)
| Field | Value |
|---|---|
| App name | Fikko |
| User support email | hello@fikko.io |
| App logo | `public/icon-512.png` resized to 120×120 PNG |
| Application home page | https://www.fikko.io |
| Privacy policy | https://www.fikko.io/privacy.html |
| Terms of service | https://www.fikko.io/terms.html |
| Authorised domains | fikko.io (remove any vercel.app domains) |
| Developer contact email | hello@fikko.io |
| User type | External |

Authorised redirect URI on the Fitbit OAuth client: `https://app.fikko.io/api/device-callback`. Authorised JavaScript origin on the sign-in client: `https://app.fikko.io`. (The marketing site is www.fikko.io; the app is app.fikko.io.) Remove localhost / vercel.app redirect URIs from the production client (keep a separate client for development if you need one).

## 2. App description (for the verification form)
> Fikko is a habit and wellness tracking app for adults (14+). Members log water, meals, activity, sleep, mood and medications, and see their own trends on a dashboard. Members can optionally connect their Fitbit or Pixel Watch so their daily activity, sleep and health metrics fill in their habits automatically instead of being typed by hand. Access is read-only. Data is synced once when the member connects and then nightly, stored in our database (Supabase, Singapore region) encrypted in transit and at rest, shown only to that member, and deleted when they disconnect and choose to delete it, or delete their account. Google user data is never sold, never used for advertising, never used to train AI models, and never sent to any AI provider; Fikko's optional AI coach explicitly excludes Google-sourced data.

## 3. Scope justifications (one per scope, paste as-is)

### `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly`
> Fikko reads three daily totals from this scope: step count, active minutes at moderate and vigorous intensity, and active calories burned. They automatically complete the member's daily Activity habit (so they don't have to type in their workout minutes), and are shown on the Activity card and in the member's weekly report as their own daily trend. We only request daily roll-ups, not individual exercise sessions, GPS routes or location. The data is read-only, shown only to the member who connected it, and never shared, sold, used for ads, or sent to any AI service.

### `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly`
> Fikko reads six once-a-day health metrics from this scope: resting heart rate, heart rate variability, blood oxygen (SpO₂), breathing rate, overnight skin temperature compared with the member's own baseline, and VO₂ max. These are shown on the member's Dashboard as "vitals" cards with a trend line, and power simple wellness tips such as noting when resting heart rate is above the member's recent average after short sleep. We read daily summaries only, never minute-by-minute heart rate or ECG data. The data is read-only, visible only to the member, and never shared, sold, used for ads, or sent to any AI service. Fikko is a general wellness app and does not diagnose or give medical advice.

### `https://www.googleapis.com/auth/googlehealth.sleep.readonly`
> Fikko reads the member's main sleep each night: total time asleep and minutes in REM, deep and light sleep (naps are ignored). This automatically completes the member's daily Sleep habit and shows sleep stages and sleep trends on their Dashboard, so they don't have to log bedtimes by hand. The data is read-only, visible only to the member, and never shared, sold, used for ads, or sent to any AI service.

### Why not narrower scopes?
> Fikko requests only the three read-only groups that contain the data it displays. It does not request nutrition, location, body-composition writing, or any write scope.

## 4. Demo video script (~3 minutes, unlisted YouTube link)

Record on the **production** sites (www.fikko.io home page, app at app.fikko.io), English UI, screen recording with voice-over or captions. Use a test Google account with a Fitbit that has some data.

| # | Show | Say / caption |
|---|---|---|
| 1 | Home page www.fikko.io, scroll to footer, click Privacy Policy | "This is Fikko, a habit tracking app. Our privacy policy is linked from the home page." |
| 2 | Scroll the policy to the **Data from Google** section | "It includes our Limited Use statement for Google user data." |
| 3 | Sign up / sign in, accept the consent screen, go through onboarding to step 5 | "New members can connect a wearable during setup." |
| 4 | Pause on the green disclosure box next to **Connect Fitbit & Pixel Watch** | "Before connecting, Fikko explains which health data it collects, why, and that it's never sold, used for ads or sent to AI." |
| 5 | Click Connect. **Show the browser address bar** on Google's consent screen so the `client_id` is visible. Pause on each of the 3 permissions | "This is Google's consent screen for our OAuth client. Fikko requests three read-only permissions: activity and fitness, health metrics, and sleep." |
| 6 | Approve, return to Fikko, finish onboarding | "Fikko runs a first sync of the last 30 days." |
| 7 | Dashboard: point at steps / active minutes / active calories, then the Activity habit auto-filled | "Activity and fitness scope: steps, active minutes and active calories fill in the Activity habit." |
| 8 | Dashboard vitals: resting HR, HRV, SpO₂, breathing rate, temperature, VO₂ max | "Health metrics scope: these daily vitals are shown to the member as trends." |
| 9 | Sleep stages chart and the Sleep habit auto-filled | "Sleep scope: last night's sleep and stages fill in the Sleep habit." |
| 10 | Profile → Connected devices: show the disclosure again, then **Disconnect** → choose to delete synced data | "Members can disconnect at any time. Fikko revokes its token and can delete everything it synced." |
| 11 | Profile → Account → Delete account (show the dialog, you can cancel) | "Deleting the account permanently removes all data after 30 days." |

Tips: keep it under 5 minutes, one continuous take is fine, and make sure the OAuth consent screen shows the app name **Fikko** and logo.

## 5. After submitting
- Reply to Google's Trust & Safety emails within a few days; slow replies are the main source of delay.
- When they ask for **CASA**: get quotes from 2-3 authorised labs (list on the App Defense Alliance site), ask for Tier 2, and mention any self-scan results. See `security-pass.md`.
- If not verified by **Nov 11**: in `src/components/profile/DevicesCard.tsx` set `LIVE = []` and in onboarding show Fitbit as "Soon". Turn it back on after approval.

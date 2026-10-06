# Breach response plan

Owner: Seok Hwan Lee (Chief Privacy Officer), hello@fikko.io. Draft 2026-10-06. **Notification clocks to be confirmed by the lawyer** (see `lawyer-brief.md`).

## 1. Detect
Signs: Supabase/Vercel/Google security emails, unusual admin dashboard totals, member reports, leaked keys (GitHub secret scanning), unexpected API spend on the Anthropic console.

## 2. Contain (first hours)
- **Revoke and rotate** any exposed secret: Supabase secret key, `CRON_SECRET`, Anthropic key, Google OAuth client secret, Vercel tokens. Redeploy.
- **If wearable tokens may be exposed:** revoke Fikko's Google OAuth access for affected members (`device_connections`) and ask them to reconnect.
- **If member sessions may be exposed:** sign everyone out (Supabase Auth), and force password reset if passwords may be involved.
- **Take the affected feature offline** if needed. Turn off AI features in `src/lib/consent.ts` checks, and set `LIVE = []` for devices.
- **Preserve evidence:** export logs before they expire, and write a timeline.

## 3. Assess (start the clock)
Record:
- when you became aware
- what data and which members (by country)
- whether health data was involved
- how many people
- whether it was hacking
- the likely harm

## 4. Notify
| Law | Who | When |
|---|---|---|
| Korea PIPA | Affected members; PIPC/KISA if ≥1,000 people, sensitive (health) data, or a hack | Within 72 hours of becoming aware |
| Australia NDB (Privacy Act) | Affected members + OAIC, if serious harm is likely | Assess within 30 days; notify as soon as practicable |
| Singapore PDPA | PDPC (and members if significant harm) if notifiable: significant harm or ≥500 people | Assess within 30 days; PDPC within 3 calendar days of deciding it's notifiable |
| US: FTC Health Breach Notification Rule | Affected members; FTC; media if ≥500 residents of one state | Within 60 days of discovery (FTC at the same time if ≥500 people; otherwise annual log) |
| US state laws (e.g. Washington) | Affected residents; state AG above thresholds | Washington: within 30 days |
| Google (API Services User Data Policy) | Google, if Google user data is involved | Promptly |

## 5. Notice template (email + in-app)
> **Subject: Important: a security incident affecting your Fikko account**
>
> On [date] we discovered [what happened]. The information involved was [items]. [Health information / was not] involved.
> What we've done: [containment]. What you can do: [reset password / reconnect device / watch for phishing].
> Contact our Chief Privacy Officer, Seok Hwan Lee, at hello@fikko.io. [Korea: you can also contact the Privacy Call Center on 118.]
> We're sorry. [Signature]

## 6. Afterwards
Write a short post-incident review: cause, fix, and what changes. Keep incident records for at least 5 years. Review this plan yearly, and after any incident.

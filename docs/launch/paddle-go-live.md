# Paddle go-live checklist

Work through this top to bottom. Tick each box as you go. Nothing in sections 1 to 3 changes the live site, so they are safe to do early.

## 1. Wait for Paddle (days, nothing to do but watch your email)

- [ ] `app.fikko.io` shows **Approved** at https://vendors.paddle.com/settings/website-approval
- [ ] `fikko.io` shows **Approved** on the same page
- [ ] Business verification is complete (PipePiper details and business registration certificate)
- [ ] Identity verification is complete
- [ ] Payout details are added and accepted
- [ ] Keep Vercel's **Attack Challenge Mode off** until both domains are approved
- [ ] Do not change prices, plan names, Terms, Privacy or the Refund Policy while Paddle is reviewing

## 2. Before launch day

- [ ] Run `040_plan_trials.sql` in the Supabase SQL editor (the 7-day trial)
- [ ] Run `041_trial_ending_email.sql` (the "trial ends soon" email)
- [ ] Vercel → Settings → Cron Jobs lists `/api/paddle-reconcile` (04:30 UTC)
- [ ] Ask your 세무사 how Paddle payouts count for tax in Korea, and whether you need the 통신판매업 신고
- [ ] Your live API key is saved in a password manager (you created it already)

## 3. Live values you will need

These already exist in your live Paddle account.

| Value | Where it is | Vercel variable | Type |
|---|---|---|---|
| Live client token ("Fikko web (live)") | https://vendors.paddle.com/authentication-v2 → Client-side tokens → ⋯ → copy | `VITE_PADDLE_CLIENT_TOKEN` | Config |
| Live API key ("Fikko live server") | Your password manager | `PADDLE_API_KEY` | Secret |
| Live webhook secret | https://vendors.paddle.com/notifications-v2 → "Fikko subscriptions" → copy secret | `PADDLE_WEBHOOK_SECRET` | Secret |
| Premium monthly price ID | `pri_01m548pt3xg5q2kr3p7gsa1ew1` | `VITE_PADDLE_PRICE_PREMIUM_MONTHLY` | Config |
| Premium yearly price ID | `pri_01m548rhmy9c07ex2ysr9y49sj` | `VITE_PADDLE_PRICE_PREMIUM_YEARLY` | Config |
| Max monthly price ID | `pri_01m548vebpe3brvg86va686m93` | `VITE_PADDLE_PRICE_MAX_MONTHLY` | Config |
| Max yearly price ID | `pri_01m548xvqckn6a7ca12atnywvc` | `VITE_PADDLE_PRICE_MAX_YEARLY` | Config |
| Environment name | type `production` | `VITE_PADDLE_ENV` | Config |

## 4. Go-live day: switch Vercel to live

Vercel → your Fikko project → Settings → Environment Variables. For every variable below, edit the existing row, replace the value, and make sure **Production** is ticked. Do not paste any of these into chat.

- [ ] `VITE_PADDLE_ENV` = `production`
- [ ] `VITE_PADDLE_CLIENT_TOKEN` = the live token (starts with `live_`)
- [ ] `VITE_PADDLE_PRICE_PREMIUM_MONTHLY`, `..._PREMIUM_YEARLY`, `..._MAX_MONTHLY`, `..._MAX_YEARLY` = the four live price IDs from section 3
- [ ] `PADDLE_API_KEY` = the live key (type Secret; Vercel may clear the value when you change the type, so paste it again)
- [ ] `PADDLE_WEBHOOK_SECRET` = the live webhook secret (type Secret)
- [ ] Deployments → latest → ⋯ → **Redeploy**, and wait until it finishes

## 5. Live Paddle settings

- [ ] https://vendors.paddle.com/checkout-settings → **Default payment link** = `https://app.fikko.io` → Save (only possible once the domain is approved)
- [ ] Check the notification destination at https://vendors.paddle.com/notifications-v2 is **Active** and points to `https://app.fikko.io/api/paddle-webhook`

## 6. Test one real purchase

- [ ] In your normal browser, sign in to `app.fikko.io` with an account that has no paid plan
- [ ] Profile → **Your plan** → Monthly → **Get Premium**. Paddle's checkout opens without a "test" banner
- [ ] Pay with your own real card (about $13)
- [ ] Within 30 seconds the card says **Premium, renews ...**, and **Manage billing** opens Paddle's portal
- [ ] In Paddle → Notifications → the destination, recent events show a 200 response
- [ ] Refund the test payment yourself: email `hello@fikko.io` or refund it in Paddle (Transactions), then cancel the subscription in Manage billing

## 7. Turn on the limits

Only when sections 4 to 6 pass. Run in the Supabase SQL editor (Supabase will warn about an UPDATE with no WHERE; that is expected, the table has one row):

```sql
update public.plan_settings set enforced = true, launched_at = now();
```

- [ ] Run it
- [ ] Check: `select enforced, launched_at from public.plan_settings;` shows `true` and a timestamp
- [ ] Your own account still shows its plan, and a free test account shows the limits and the "Try Premium free" button

## 8. After launch

- [ ] Turn Vercel's **Attack Challenge Mode** back on if you want it, once both domains show Approved
- [ ] Next morning: check that the nightly `/api/paddle-reconcile` ran without errors (Vercel → Logs)
- [ ] Watch Paddle → Transactions and Notifications for failed deliveries for the first few days
- [ ] Remove the founding-member banner on the marketing site once all 100 places are taken

## Undo, if something goes wrong

- Stop applying limits: `update public.plan_settings set enforced = false;` (everyone has full access again)
- Go back to test payments: set `VITE_PADDLE_ENV` to `sandbox` and restore the sandbox token, prices, key and secret from `.env.local`, then redeploy
- Hide the plan card entirely: remove `VITE_PADDLE_CLIENT_TOKEN` from Production and redeploy

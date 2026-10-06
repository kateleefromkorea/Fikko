# Security pass (CASA / OWASP ASVS prep)

Self-review done 2026-10-06 before paying a CASA lab. Scope: `api/**`, `vercel.json`, database migrations (RLS), production dependencies, live headers on www.fikko.io. Hand this to the assessor; it shortens their work.

## Summary
| Area | Result |
|---|---|
| Authentication on API endpoints | ✅ Every member endpoint verifies the Supabase session token server-side (`memberFrom`, `api/_lib/devices.ts`). Cron endpoints require `CRON_SECRET`. |
| Authorisation / data isolation | ✅ All 27 tables have row-level security enabled. Server-only tables (`oauth_states`, token columns) have no client grants. |
| OAuth (Google Health) | ✅ PKCE (S256), random one-time `state`, 15-minute expiry, deleted on first use; read-only scopes; tokens revoked on disconnect and on account purge. |
| Consent enforcement | ✅ Checked server-side (`consentError`) before device connect and every AI call. |
| Input validation | ✅ Length/count caps on every AI endpoint, food search and barcode; enum allow-lists for tags, diets, allergens. |
| CORS | ✅ Allow-list of the Capacitor app origins only; bearer tokens, no cookies. |
| Secrets | ✅ Supabase secret key, Google and Anthropic keys only in server env vars; nothing secret in the client bundle. |
| Transport & headers | ✅ HTTPS only, HSTS, strict CSP, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy. |
| Production dependencies | ✅ `npm audit --omit=dev`: 0 vulnerabilities (after the fixes below). |
| Tokens at rest | ✅ Wearable access/refresh tokens encrypted with AES-256-GCM (`api/_lib/tokenCrypto.ts`); key only in the `TOKEN_ENCRYPTION_KEY` env var. |

## Fixed in this pass
1. **Dependencies:** `npm audit fix` (source-map-js 1.2.1 → 1.2.2, shadcn 4.21.0 → 4.21.3), and `shadcn` moved to `devDependencies` (it's a build-time CLI/CSS import). Production audit now clean; build verified.
2. **HSTS:** added `includeSubDomains` in `vercel.json` (live header had `max-age` only).
3. **Tokens encrypted at rest:** `device_connections` tokens are AES-256-GCM encrypted before storage (random IV per value, tamper-detecting). Older plain-text rows still read and are re-encrypted at the next refresh.
4. **No collection after a deletion request:** the nightly sync (`api/devices.ts`) now skips members whose account is scheduled for deletion.

## Open items
1. **No security event logging/alerting** beyond Vercel/Supabase logs (ASVS V7). Before CASA, enable Supabase Auth audit logs and Vercel log retention; document who checks them.
2. **Admin access:** `/admin` uses Supabase MFA (migration 017). Confirm MFA is enforced for every admin account and for the Supabase/Vercel/Google Cloud dashboards themselves.
3. **Rate limiting** relies on daily AI caps and provider limits; no general per-IP limit. Usually acceptable for Tier 2, mention it if asked.

## Before the lab scan (free)
- Run OWASP ZAP baseline against https://www.fikko.io and fix anything High/Medium.
- Re-run `npm audit --omit=dev` (0 expected).
- Keep this document and the Google pack (`google-verification.md`) ready to send.

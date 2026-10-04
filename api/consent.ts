// Privacy consents.
//
//   GET  → { country, region, version, consents }   region is the notice to
//          show for where the request comes from; consents is empty when
//          signed out.
//   POST { region, choices: { [key]: boolean } } with "Authorization: Bearer
//          <member session token>" → records each choice under the current
//          policy version, with the country taken from the request.

import { admin, json, memberFrom, supabaseReady } from "./_lib/devices.js";
import { CONSENT_KEYS, POLICY_VERSION, REGIONS, countryOf, currentConsents, regionFor, type ConsentKey, type Region } from "./_lib/consent.js";
import { OPTIONS, withCors } from "./_lib/cors.js";

const REQUIRED: ConsentKey[] = ["terms", "personal_info", "health_data", "overseas_transfer"];

async function handleGET(request: Request) {
  const country = countryOf(request);
  const base = { country, region: regionFor(country), version: POLICY_VERSION };
  if (!supabaseReady()) return json({ ...base, consents: {} });
  const db = admin();
  const member = await memberFrom(request, db);
  return json({ ...base, consents: member ? await currentConsents(db, member.id) : {} }, 200, { "Cache-Control": "no-store" });
}

async function handlePOST(request: Request) {
  if (!supabaseReady()) return json({ error: "Consents aren't configured on the server." }, 503);
  const db = admin();
  const member = await memberFrom(request, db);
  if (!member) return json({ error: "Sign in again to continue." }, 401);

  const body = (await request.json().catch(() => ({}))) as { region?: unknown; choices?: unknown };
  const region: Region = (REGIONS as readonly unknown[]).includes(body.region) ? (body.region as Region) : "OTHER";
  const choices = body.choices && typeof body.choices === "object" ? (body.choices as Record<string, unknown>) : {};
  const rows = CONSENT_KEYS
    .filter((k) => typeof choices[k] === "boolean")
    .map((k) => ({
      user_id: member.id,
      consent_key: k,
      granted: choices[k] as boolean,
      policy_version: POLICY_VERSION,
      region,
      country: countryOf(request) || null,
    }));
  if (!rows.length) return json({ error: "Nothing to save." }, 400);
  // Required consents can't be withdrawn one by one: that's what deleting the account is for.
  if (rows.some((r) => REQUIRED.includes(r.consent_key) && !r.granted)) {
    return json({ error: "These are needed to use Fikko. To withdraw them, delete your account in Profile." }, 400);
  }

  const { error } = await db.from("consent_records").insert(rows);
  if (error) return json({ error: "We couldn't save your choices. Please try again." }, 500);
  return json({ consents: await currentConsents(db, member.id) });
}

export const GET = withCors(handleGET);
export const POST = withCors(handlePOST);
export { OPTIONS };

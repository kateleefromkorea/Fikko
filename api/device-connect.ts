// Starts connecting a wearable provider: records a one-time state and PKCE
// verifier for the signed-in member, then returns the provider's sign-in URL
// for the browser to open. The provider sends the member back to device-callback.

import { admin, json, memberFrom, pkceChallenge, providerFor, randomToken, redirectUri, supabaseReady } from "./_lib/devices.js";
import { consentError } from "./_lib/consent.js";
import { OPTIONS, withCors } from "./_lib/cors.js";

async function handlePOST(request: Request) {
  const { provider: id } = (await request.json().catch(() => ({}))) as { provider?: string };
  const provider = providerFor(id);
  if (!provider) return json({ error: "Unknown device." }, 400);
  if (!provider.ready() || !supabaseReady()) return json({ error: `${provider.name} sync isn't set up on the server yet.` }, 503);

  const db = admin();
  const member = await memberFrom(request, db);
  if (!member) return json({ error: `Sign in again to connect ${provider.name}.` }, 401);
  const blocked = await consentError(db, member.id, ["health_data", "overseas_transfer"]);
  if (blocked) return blocked;

  const state = randomToken();
  const verifier = randomToken(48);
  // Clear this member's stale attempts for this provider, then record the new one.
  await db.from("oauth_states").delete().eq("user_id", member.id).eq("provider", provider.id);
  const { error } = await db.from("oauth_states").insert({ state, user_id: member.id, provider: provider.id, code_verifier: verifier });
  if (error) return json({ error: `Couldn't start connecting ${provider.name}. Please try again.` }, 500);

  return json({ url: provider.authorizeUrl(redirectUri(request), state, await pkceChallenge(verifier)) });
}

// The mobile apps call these from another origin (see _lib/cors.ts).
export const POST = withCors(handlePOST);
export { OPTIONS };

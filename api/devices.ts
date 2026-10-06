// Wearable connections for the signed-in member, in one function (Vercel's
// Hobby plan allows 12 per deployment). The provider's redirect back is
// separate, in device-callback.ts, because its URL is registered with each provider.
//
//   POST { action: "connect", provider }
//     Records a one-time state and PKCE verifier, then returns the provider's
//     sign-in URL for the browser to open.
//   POST { action: "sync", provider }
//     The app's "Sync now" button: syncs the member now.
//   POST { action: "disconnect", provider, deleteData }
//     Revokes Fikko's access at the provider, removes the stored tokens, and,
//     if asked, deletes the readings synced from that provider.
//   GET, from Vercel's nightly cron: syncs every connection. Vercel sends
//     "Authorization: Bearer <CRON_SECRET>", which is checked before anything runs.
//
// POST calls carry "Authorization: Bearer <member session token>".

import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import {
  admin, decryptToken, json, memberFrom, pkceChallenge, providerFor, randomToken, redirectUri, supabaseReady, syncMember,
  type ProviderAdapter,
} from "./_lib/devices.js";
import { consentError } from "./_lib/consent.js";
import { OPTIONS, withCors } from "./_lib/cors.js";

async function handlePOST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { action?: string; provider?: string; deleteData?: boolean };
  const provider = providerFor(body.provider);
  if (!provider) return json({ error: "Unknown device." }, 400);
  if (body.action !== "connect" && body.action !== "sync" && body.action !== "disconnect") {
    return json({ error: "Unknown action." }, 400);
  }
  if (body.action !== "disconnect" && !provider.ready()) {
    return json({ error: `${provider.name} sync isn't set up on the server yet.` }, 503);
  }
  if (!supabaseReady()) return json({ error: `${provider.name} sync isn't set up on the server yet.` }, 503);

  const db = admin();
  const member = await memberFrom(request, db);
  if (!member) return json({ error: "Your session has expired. Sign in again and retry." }, 401);

  if (body.action === "connect") return connect(request, db, member, provider);
  if (body.action === "sync") return sync(db, member, provider);
  return disconnect(db, member, provider, body.deleteData === true);
}

async function connect(request: Request, db: SupabaseClient, member: User, provider: ProviderAdapter) {
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

async function sync(db: SupabaseClient, member: User, provider: ProviderAdapter) {
  try {
    return json({ saved: await syncMember(db, member.id, provider) });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Sync failed." }, 502);
  }
}

async function disconnect(db: SupabaseClient, member: User, provider: ProviderAdapter, deleteData: boolean) {
  const { data: conn } = await db.from("device_connections").select("access_token")
    .eq("user_id", member.id).eq("provider", provider.id).maybeSingle();
  if (conn) await provider.revoke(await decryptToken(conn.access_token));
  await db.from("device_connections").delete().eq("user_id", member.id).eq("provider", provider.id);
  if (deleteData) await db.from("biometric_entries").delete().eq("user_id", member.id).eq("source", provider.id);
  return json({ disconnected: true });
}

async function handleGET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "Not allowed." }, 401);
  if (!supabaseReady()) return json({ error: "Not configured." }, 503);

  const db = admin();
  const { data: conns } = await db.from("device_connections").select("user_id, provider");
  // Members who asked to delete their account get nothing new collected during the grace period.
  const { data: leaving } = await db.from("profiles").select("user_id").not("deletion_scheduled_for", "is", null);
  const skip = new Set((leaving ?? []).map((p) => p.user_id));
  let synced = 0;
  let failed = 0;
  // One at a time keeps well inside providers' rate limits.
  for (const c of conns ?? []) {
    if (skip.has(c.user_id)) continue;
    const provider = providerFor(c.provider);
    if (!provider?.ready()) continue;
    try { await syncMember(db, c.user_id, provider); synced++; } catch { failed++; }
  }
  return json({ synced, failed });
}

// The mobile apps call these from another origin (see _lib/cors.ts).
export const POST = withCors(handlePOST);
export const GET = withCors(handleGET);
export { OPTIONS };

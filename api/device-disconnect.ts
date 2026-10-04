// Disconnects a wearable for the signed-in member: revokes Fikko's access at
// the provider, removes the stored tokens, and, if asked, deletes the
// readings synced from that provider.

import { admin, json, memberFrom, providerFor } from "./_lib/devices.js";
import { OPTIONS, withCors } from "./_lib/cors.js";

async function handlePOST(request: Request) {
  const { provider: id, deleteData } = (await request.json().catch(() => ({}))) as { provider?: string; deleteData?: boolean };
  const provider = providerFor(id);
  if (!provider) return json({ error: "Unknown device." }, 400);
  const db = admin();
  const member = await memberFrom(request, db);
  if (!member) return json({ error: "Sign in again to disconnect." }, 401);

  const { data: conn } = await db.from("device_connections").select("access_token")
    .eq("user_id", member.id).eq("provider", provider.id).maybeSingle();
  if (conn) await provider.revoke(conn.access_token);
  await db.from("device_connections").delete().eq("user_id", member.id).eq("provider", provider.id);
  if (deleteData) await db.from("biometric_entries").delete().eq("user_id", member.id).eq("source", provider.id);
  return json({ disconnected: true });
}

// The mobile apps call these from another origin (see _lib/cors.ts).
export const POST = withCors(handlePOST);
export { OPTIONS };

// Syncs wearable data.
//   POST { provider }, from the app's "Sync now" button: syncs the signed-in member.
//   GET, from Vercel's nightly cron: syncs every connection. Vercel sends
//   "Authorization: Bearer <CRON_SECRET>", which is checked before anything runs.

import { admin, json, memberFrom, providerFor, supabaseReady, syncMember } from "./_lib/devices.js";

export async function POST(request: Request) {
  const { provider: id } = (await request.json().catch(() => ({}))) as { provider?: string };
  const provider = providerFor(id);
  if (!provider) return json({ error: "Unknown device." }, 400);
  if (!provider.ready() || !supabaseReady()) return json({ error: `${provider.name} sync isn't set up on the server yet.` }, 503);
  const db = admin();
  const member = await memberFrom(request, db);
  if (!member) return json({ error: "Sign in again to sync." }, 401);
  try {
    return json({ saved: await syncMember(db, member.id, provider) });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Sync failed." }, 502);
  }
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "Not allowed." }, 401);
  if (!supabaseReady()) return json({ error: "Not configured." }, 503);

  const db = admin();
  const { data: conns } = await db.from("device_connections").select("user_id, provider");
  let synced = 0;
  let failed = 0;
  // One at a time keeps well inside providers' rate limits.
  for (const c of conns ?? []) {
    const provider = providerFor(c.provider);
    if (!provider?.ready()) continue;
    try { await syncMember(db, c.user_id, provider); synced++; } catch { failed++; }
  }
  return json({ synced, failed });
}

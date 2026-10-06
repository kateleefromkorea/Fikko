// Account deletion, with a 30-day grace period.
//   POST, from the app: schedules the signed-in member's account for deletion
//   30 days out and signs them out everywhere. Signing back in before then
//   offers to restore it. Optionally records an anonymous reason for leaving.
//   GET, from Vercel's nightly cron: permanently deletes every account whose
//   date has passed. Vercel sends "Authorization: Bearer <CRON_SECRET>", which
//   is checked before anything runs.
//
// Runs on the server because it needs the Supabase secret key, which bypasses
// row-level security and must never reach the browser. The caller proves who
// they are with their own session token; POST only ever touches that user.
// Every table references auth.users with ON DELETE CASCADE, so removing the
// auth user removes their profile, habits, food log, medications and saved
// foods with it. Recipe photos live in storage, which doesn't cascade, so
// those are removed first.

import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, decryptToken, json, memberFrom, providerFor, supabaseReady } from "./_lib/devices.js";
import { OPTIONS, withCors } from "./_lib/cors.js";

const GRACE_DAYS = 30;

async function handlePOST(request: Request) {
  if (!supabaseReady()) return json({ error: "Account deletion isn't configured on the server." }, 500);
  const db = admin();
  const member = await memberFrom(request, db);
  if (!member) return json({ error: "Your session has expired. Sign in again and retry." }, 401);

  const body = (await request.json().catch(() => ({}))) as { reason?: unknown; details?: unknown };
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 60) : "";
  const details = typeof body.details === "string" ? body.details.trim().slice(0, 1000) : "";

  const scheduledFor = new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await db.from("profiles").update({ deletion_scheduled_for: scheduledFor }).eq("user_id", member.id);
  if (error) return json({ error: "We couldn't delete your account. Please try again." }, 500);

  // Feedback is anonymous and optional; failing to save it shouldn't block leaving.
  if (reason) await db.from("account_deletion_feedback").insert({ reason, details: details || null });

  // End sessions on every device, not just this one.
  const token = request.headers.get("authorization")!.replace(/^Bearer\s+/i, "");
  await db.auth.admin.signOut(token, "global");

  return json({ scheduledFor });
}

async function handleGET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "Not allowed." }, 401);
  if (!supabaseReady()) return json({ error: "Not configured." }, 503);

  const db = admin();
  const { data: due } = await db
    .from("profiles")
    .select("user_id")
    .not("deletion_scheduled_for", "is", null)
    .lte("deletion_scheduled_for", new Date().toISOString());

  let deleted = 0;
  let failed = 0;
  for (const { user_id } of due ?? []) {
    try { await purgeAccount(db, user_id); deleted++; } catch { failed++; }
  }
  return json({ deleted, failed });
}

/** Permanently deletes one account and everything that belongs to it. */
async function purgeAccount(db: SupabaseClient, userId: string) {
  // Revoke Fikko's access at any connected wearable provider before the tokens are deleted.
  const { data: conns } = await db.from("device_connections").select("provider, access_token").eq("user_id", userId);
  for (const c of conns ?? []) await providerFor(c.provider)?.revoke(await decryptToken(c.access_token));

  // Photos are stored under "<user id>/" in the recipe-photos bucket.
  const photos = await db.storage.from("recipe-photos").list(userId, { limit: 1000 });
  if (photos.data?.length) {
    await db.storage.from("recipe-photos").remove(photos.data.map((f) => `${userId}/${f.name}`));
  }

  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) throw error;
}

// The mobile apps call these from another origin (see _lib/cors.ts).
export const POST = withCors(handlePOST);
export const GET = withCors(handleGET);
export { OPTIONS };

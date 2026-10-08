// Paddle webhook: keeps the `subscriptions` table (migration 035) in step with
// what members have paid for. Paddle sends the full subscription each time, so
// the latest event simply overwrites the row.
//
// The member is identified by custom_data.user_id, which the app attaches when
// it opens checkout (src/lib/paddle.ts). Setup: Paddle → Developer Tools →
// Notifications → add this URL (/api/paddle-webhook) with the subscription.*
// events, then put the endpoint's secret in PADDLE_WEBHOOK_SECRET.

import { admin, json, supabaseReady } from "./_lib/devices.js";
import { subscriptionRow, validSignature, type PaddleSubscription } from "./_lib/paddle.js";

async function handlePOST(request: Request) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!supabaseReady() || !secret) return json({ error: "Payments aren't configured on the server." }, 503);

  const raw = await request.text();
  if (!validSignature(request.headers.get("paddle-signature"), raw, secret)) return json({ error: "Bad signature." }, 401);

  let event: { event_type?: string; data?: PaddleSubscription };
  try { event = JSON.parse(raw); } catch { return json({ error: "Bad request." }, 400); }

  // Other events (transactions, customers) aren't needed; acknowledge so Paddle stops retrying.
  if (!event.event_type?.startsWith("subscription.") || !event.data) return json({ ok: true, ignored: true });

  const row = subscriptionRow(event.data);
  if (!row) {
    console.warn("paddle-webhook: skipped", event.event_type, event.data.id);
    return json({ ok: true, ignored: true });
  }

  const { error } = await admin().from("subscriptions").upsert(row, { onConflict: "user_id" });

  // A deleted member can't hold a subscription: acknowledge instead of retrying forever.
  if (error?.code === "23503") return json({ ok: true, ignored: true });
  // Any other failure: a non-2xx makes Paddle retry later.
  if (error) return json({ error: "Couldn't save the subscription." }, 500);
  return json({ ok: true });
}

export const POST = handlePOST;

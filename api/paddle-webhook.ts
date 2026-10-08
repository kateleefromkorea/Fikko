// Paddle webhook: keeps the `subscriptions` table (migration 035) in step with
// what members have paid for. Paddle sends the full subscription each time, so
// the latest event simply overwrites the row.
//
// The member is identified by custom_data.user_id, which the app attaches when
// it opens checkout (src/lib/paddle.ts). Setup: Paddle → Developer Tools →
// Notifications → add this URL (/api/paddle-webhook) with the subscription.*
// events, then put the endpoint's secret in PADDLE_WEBHOOK_SECRET.

import { admin, json, supabaseReady } from "./_lib/devices.js";
import { planForPrice, validSignature } from "./_lib/paddle.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Status = "active" | "trialing" | "past_due" | "canceled";
/** Paddle's statuses → ours. A paused subscription has no access until it resumes. */
const STATUS: Record<string, Status> = { active: "active", trialing: "trialing", past_due: "past_due", paused: "canceled", canceled: "canceled" };

interface PaddleSubscription {
  id?: string;
  status?: string;
  customer_id?: string;
  custom_data?: { user_id?: unknown } | null;
  items?: { price?: { id?: string } | null }[];
  current_billing_period?: { ends_at?: string } | null;
}

async function handlePOST(request: Request) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!supabaseReady() || !secret) return json({ error: "Payments aren't configured on the server." }, 503);

  const raw = await request.text();
  if (!validSignature(request.headers.get("paddle-signature"), raw, secret)) return json({ error: "Bad signature." }, 401);

  let event: { event_type?: string; data?: PaddleSubscription };
  try { event = JSON.parse(raw); } catch { return json({ error: "Bad request." }, 400); }

  // Other events (transactions, customers) aren't needed; acknowledge so Paddle stops retrying.
  if (!event.event_type?.startsWith("subscription.") || !event.data) return json({ ok: true, ignored: true });

  const sub = event.data;
  const userId = sub.custom_data?.user_id;
  const plan = planForPrice(sub.items?.[0]?.price?.id);
  const status = STATUS[sub.status ?? ""];
  if (typeof userId !== "string" || !UUID.test(userId) || !plan || !status || !sub.id) {
    console.warn("paddle-webhook: skipped", event.event_type, sub.id);
    return json({ ok: true, ignored: true });
  }

  // Access runs to the end of the paid period; a canceled or paused plan ends now.
  const ends = status === "canceled" ? new Date().toISOString() : sub.current_billing_period?.ends_at ?? null;

  const { error } = await admin().from("subscriptions").upsert({
    user_id: userId,
    plan,
    status,
    source: "paddle",
    provider_customer_id: sub.customer_id ?? null,
    provider_subscription_id: sub.id,
    current_period_end: ends,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  // A deleted member can't hold a subscription: acknowledge instead of retrying forever.
  if (error?.code === "23503") return json({ ok: true, ignored: true });
  // Any other failure: a non-2xx makes Paddle retry later.
  if (error) return json({ error: "Couldn't save the subscription." }, 500);
  return json({ ok: true });
}

export const POST = handlePOST;

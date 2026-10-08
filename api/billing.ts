// POST with "Authorization: Bearer <member session token>" → { url }, a
// one-time link to Paddle's customer portal, where the member can update their
// card, see invoices or cancel. Needs PADDLE_API_KEY (server-only).

import { admin, json, memberFrom, supabaseReady } from "./_lib/devices.js";
import { paddleApi } from "./_lib/paddle.js";
import { SLOW_DOWN, withinLimit } from "./_lib/rateLimit.js";

async function handlePOST(request: Request) {
  const key = process.env.PADDLE_API_KEY;
  if (!supabaseReady() || !key) return json({ error: "Billing isn't set up yet." }, 503);
  const db = admin();
  const member = await memberFrom(request, db);
  if (!member) return json({ error: "Sign in again to continue." }, 401);
  if (!(await withinLimit(db, `billing:${member.id}`, 10, 3600))) return json({ error: SLOW_DOWN }, 429);

  const { data: sub } = await db.from("subscriptions")
    .select("provider_customer_id, provider_subscription_id, source").eq("user_id", member.id).maybeSingle();
  if (!sub || sub.source !== "paddle" || !sub.provider_customer_id) return json({ error: "There's no subscription to manage." }, 404);

  const res = await fetch(`${paddleApi()}/customers/${sub.provider_customer_id}/portal-sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ subscription_ids: sub.provider_subscription_id ? [sub.provider_subscription_id] : [] }),
  });
  const body = (await res.json().catch(() => null)) as { data?: { urls?: { general?: { overview?: string } } } } | null;
  const url = body?.data?.urls?.general?.overview;
  if (!res.ok || !url) return json({ error: "We couldn't open billing. Please try again." }, 502);
  return json({ url });
}

export const POST = handlePOST;

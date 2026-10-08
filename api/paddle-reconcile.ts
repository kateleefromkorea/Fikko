// Nightly check that `subscriptions` still matches Paddle. The webhook keeps it
// current as things happen; this catches anything it missed or got out of order
// (a delivery that failed, a renewal date that changed). Vercel's cron calls it
// with "Authorization: Bearer <CRON_SECRET>", which is checked before anything runs.
//
// Paddle is the source of truth: each Paddle subscription that can be matched to
// a member is written to the table exactly as the webhook would write it.

import { admin, json, supabaseReady } from "./_lib/devices.js";
import { paddleApi, subscriptionRow, type PaddleSubscription } from "./_lib/paddle.js";

/** Stops a runaway loop; 20 pages of 200 is far beyond what Fikko will have for a long time. */
const MAX_PAGES = 20;

async function handleGET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "Not allowed." }, 401);
  const key = process.env.PADDLE_API_KEY;
  if (!supabaseReady() || !key) return json({ error: "Not configured." }, 503);

  const db = admin();
  let url: string | null = `${paddleApi()}/subscriptions?per_page=200`;
  let seen = 0;
  let skipped = 0;
  // One row per member. A member can have an old canceled subscription next to a
  // current one, so a live subscription always wins over a canceled one.
  const rows = new Map<string, NonNullable<ReturnType<typeof subscriptionRow>>>();

  for (let page = 0; url && page < MAX_PAGES; page++) {
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) return json({ error: "Couldn't read subscriptions from Paddle.", seen }, 502);
    const body = (await res.json()) as { data?: PaddleSubscription[]; meta?: { pagination?: { has_more?: boolean; next?: string } } };

    for (const sub of body.data ?? []) {
      seen++;
      const row = subscriptionRow(sub);
      if (!row) { skipped++; continue; }
      const prev = rows.get(row.user_id);
      if (!prev || (prev.status === "canceled" && row.status !== "canceled")) rows.set(row.user_id, row);
    }
    url = body.meta?.pagination?.has_more ? body.meta.pagination.next ?? null : null;
  }

  let synced = 0;
  let failed = 0;
  for (const row of rows.values()) {
    const { error } = await db.from("subscriptions").upsert(row, { onConflict: "user_id" });
    // A member who has since deleted their account can't hold a subscription.
    if (error && error.code !== "23503") failed++;
    else synced++;
  }
  return json({ seen, synced, skipped, failed });
}

export const GET = handleGET;

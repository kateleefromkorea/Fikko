// Paddle (merchant of record) helpers shared by the webhook and billing
// endpoints. Price ids are the same ones the app opens checkout with, so they
// live in one set of variables (VITE_ ones are public, and fine to read here).

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Plan } from "./plans.js";

export const paddleApi = () =>
  process.env.VITE_PADDLE_ENV === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";

/** Which plan a Paddle price id grants, or null for one we don't recognise. */
export function planForPrice(priceId: unknown): Exclude<Plan, "free"> | null {
  if (typeof priceId !== "string" || !priceId) return null;
  const env = process.env;
  if (priceId === env.VITE_PADDLE_PRICE_PREMIUM_MONTHLY || priceId === env.VITE_PADDLE_PRICE_PREMIUM_YEARLY) return "premium";
  if (priceId === env.VITE_PADDLE_PRICE_MAX_MONTHLY || priceId === env.VITE_PADDLE_PRICE_MAX_YEARLY) return "max";
  return null;
}

/**
 * Checks the Paddle-Signature header ("ts=...;h1=...") against the raw body:
 * h1 is HMAC-SHA256 of "<ts>:<body>" with the endpoint's secret. Rejects
 * signatures older than five minutes so a captured request can't be replayed.
 */
export function validSignature(header: string | null, rawBody: string, secret: string) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(";").map((p) => p.split("=") as [string, string]));
  const ts = parts.ts;
  const h1 = parts.h1;
  if (!ts || !h1 || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${ts}:${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(h1);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Cancels a member's Paddle subscription so it stops billing. "next_billing_period"
 * keeps the access they've paid for until it ends; "immediately" stops it now.
 * Returns true when the subscription is no longer going to renew (including when
 * it was already canceled), false if Paddle couldn't be reached or refused.
 */
export async function cancelPaddleSubscription(subscriptionId: string, when: "next_billing_period" | "immediately") {
  const key = process.env.PADDLE_API_KEY;
  if (!key) return false;
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  try {
    const current = await fetch(`${paddleApi()}/subscriptions/${subscriptionId}`, { headers });
    if (current.status === 404) return true; // already gone
    const body = (await current.json().catch(() => null)) as { data?: { status?: string } } | null;
    if (body?.data?.status === "canceled") return true;
    const res = await fetch(`${paddleApi()}/subscriptions/${subscriptionId}/cancel`, {
      method: "POST",
      headers,
      body: JSON.stringify({ effective_from: when }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

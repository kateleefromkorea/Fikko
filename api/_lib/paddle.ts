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

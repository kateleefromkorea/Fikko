// The daily AI allowance shared by the coach and voice check-ins. Each
// successful AI reply adds a row to coach_usage (server-only, see migration
// 014); the allowance resets at the member's local midnight.

import type { SupabaseClient } from "@supabase/supabase-js";
import { SLOW_DOWN, withinLimit } from "./rateLimit.js";

export const DAILY_AI_LIMIT = 20;

/** Minutes behind UTC, as Date.getTimezoneOffset() gives it; real zones span -14h to +12h. */
export function clampOffset(raw: unknown) {
  return typeof raw === "number" && Number.isFinite(raw) ? Math.max(-14 * 60, Math.min(12 * 60, Math.round(raw))) : 0;
}

/** UTC instant of the member's local midnight today. */
function localMidnight(tzOffset: number) {
  const local = new Date(Date.now() - tzOffset * 60_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + tzOffset * 60_000);
}

/** AI replies the member has used since their local midnight. */
export async function usedToday(db: SupabaseClient, userId: string, tzOffset: number) {
  const { count } = await db.from("coach_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", localMidnight(tzOffset).toISOString());
  return count ?? 0;
}

/**
 * The local day comes from the device's time zone, which the request carries,
 * so a script could keep moving "midnight" to reset the allowance. This cap on
 * any 24 hours, whatever the time zone, stops that. Someone who stays in one
 * zone can use at most 20 before midnight and 20 after, so it never affects
 * them.
 */
const ROLLING_AI_LIMIT = DAILY_AI_LIMIT * 2;
/** AI calls a minute. Stops bursts of parallel requests slipping past the daily count. */
const AI_PER_MINUTE = 6;

/**
 * Whether the member may make another AI call now. `blocked` is "daily" when
 * they've used their allowance and "fast" when they're sending too quickly;
 * `used` is today's count.
 */
export async function checkAllowance(db: SupabaseClient, userId: string, tzOffset: number) {
  const [used, rolling, calm] = await Promise.all([
    usedToday(db, userId, tzOffset),
    db.from("coach_usage").select("id", { count: "exact", head: true })
      .eq("user_id", userId).gte("created_at", new Date(Date.now() - 86_400_000).toISOString())
      .then(({ count }) => count ?? 0),
    withinLimit(db, `ai:${userId}`, AI_PER_MINUTE, 60),
  ]);
  const blocked = used >= DAILY_AI_LIMIT || rolling >= ROLLING_AI_LIMIT ? "daily" as const : !calm ? "fast" as const : null;
  return { used, blocked };
}

/** The reply for a blocked AI call. */
export const blockedReply = (blocked: "daily" | "fast") =>
  new Response(JSON.stringify({ error: blocked === "fast" ? SLOW_DOWN : limitMessage() }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export async function recordUse(db: SupabaseClient, userId: string) {
  await db.from("coach_usage").insert({ user_id: userId });
}

export const limitMessage = () =>
  `You've used today's ${DAILY_AI_LIMIT} AI messages (coach and voice check-ins together). They reset at midnight.`;

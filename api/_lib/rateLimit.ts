// Rate limits, so one account or script can't run up costs or use up a shared
// quota (the USDA key, Resend, the AI bill) for everyone else. Counters live in
// Postgres (migration 032), so they hold across Vercel's many function copies.
//
// If the counter can't be reached (the migration isn't run yet, or the
// database hiccups) the request is let through: a limit should never take
// Fikko down.

import type { SupabaseClient } from "@supabase/supabase-js";

export const SLOW_DOWN = "You're going a little fast. Wait a minute, then try again.";

/** True while `key` has had at most `max` hits in the current `windowSeconds` window. */
export async function withinLimit(db: SupabaseClient, key: string, max: number, windowSeconds: number) {
  const { data, error } = await db.rpc("rate_limit", { p_key: key, p_max: max, p_window_seconds: windowSeconds });
  return error ? true : data !== false;
}

/** Several limits on one request, e.g. per minute and per hour. All of them count the hit. */
export async function withinLimits(db: SupabaseClient, key: string, limits: [max: number, windowSeconds: number][]) {
  const results = await Promise.all(limits.map(([max, seconds]) => withinLimit(db, `${key}:${seconds}`, max, seconds)));
  return results.every(Boolean);
}

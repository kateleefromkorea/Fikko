// The daily AI allowance shared by the coach and voice check-ins. Each
// successful AI reply adds a row to coach_usage (server-only, see migration
// 014); the allowance resets at the member's local midnight.

import type { SupabaseClient } from "@supabase/supabase-js";

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

export async function recordUse(db: SupabaseClient, userId: string) {
  await db.from("coach_usage").insert({ user_id: userId });
}

export const limitMessage = () =>
  `You've used today's ${DAILY_AI_LIMIT} AI messages (coach and voice check-ins together). They reset at midnight.`;

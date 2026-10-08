// The daily AI allowance shared by the coach and voice check-ins. Each
// successful AI reply adds a row to coach_usage (server-only, see migration
// 014); the allowance resets at the member's local midnight.

import type { SupabaseClient } from "@supabase/supabase-js";
import { FAIR_USE_DAILY_AI, PLAN_LIMITS, planOf, type PlanState } from "./plans.js";
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

/** Free's allowance is per rolling 7 days, so there is no midnight to game. */
const WEEK_MS = 7 * 86_400_000;

export type Blocked = "daily" | "weekly" | "fast";

/**
 * What a member may spend on AI. While plans aren't enforced everyone gets
 * DAILY_AI_LIMIT a day. Once they are: Free gets `aiPerWeek` a week, Premium
 * and Max get their `coachPerDay` a day. That allowance is shared by every AI
 * feature (coach, voice, photo, recipes), and FAIR_USE_DAILY_AI caps any 24 hours.
 */
export function allowanceFor({ plan, enforced }: PlanState) {
  if (!enforced) return { limit: DAILY_AI_LIMIT, period: "day" as const, rolling: ROLLING_AI_LIMIT };
  const l = PLAN_LIMITS[plan];
  if (l.aiPerWeek != null) return { limit: l.aiPerWeek, period: "week" as const, rolling: FAIR_USE_DAILY_AI };
  return { limit: l.coachPerDay ?? l.aiPerDay, period: "day" as const, rolling: l.aiPerDay };
}

/**
 * Whether the member may make another AI call now. `blocked` is "daily" or
 * "weekly" when they've used their allowance and "fast" when they're sending
 * too quickly; `used` is their count for the period and `limit` the allowance.
 */
export async function checkAllowance(db: SupabaseClient, userId: string, tzOffset: number) {
  const state = await planOf(db, userId);
  const { limit, period, rolling: rollingLimit } = allowanceFor(state);
  const since = (ms: number) => new Date(Date.now() - ms).toISOString();
  const count = (iso: string) => db.from("coach_usage").select("id", { count: "exact", head: true })
    .eq("user_id", userId).gte("created_at", iso).then(({ count: n }) => n ?? 0);
  const [used, rolling, calm] = await Promise.all([
    period === "week" ? count(since(WEEK_MS)) : usedToday(db, userId, tzOffset),
    count(since(86_400_000)),
    withinLimit(db, `ai:${userId}`, AI_PER_MINUTE, 60),
  ]);
  const blocked: Blocked | null = used >= limit || rolling >= rollingLimit ? (period === "week" ? "weekly" : "daily") : !calm ? "fast" : null;
  return { used, limit, plan: state.plan, enforced: state.enforced, blocked };
}

/** The reply for a blocked AI call. */
export const blockedReply = (blocked: Blocked, limit = DAILY_AI_LIMIT) =>
  new Response(JSON.stringify({ error: blocked === "fast" ? SLOW_DOWN : limitMessage(blocked, limit) }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export async function recordUse(db: SupabaseClient, userId: string) {
  await db.from("coach_usage").insert({ user_id: userId });
}

export const limitMessage = (blocked: "daily" | "weekly" = "daily", limit = DAILY_AI_LIMIT) =>
  blocked === "weekly"
    ? `You've used this week's ${limit} AI messages on the Free plan (coach, voice and photo check-ins together). Premium gives you ${PLAN_LIMITS.premium.coachPerDay} a day.`
    : `You've used today's ${limit} AI messages (coach and voice check-ins together). They reset at midnight.`;

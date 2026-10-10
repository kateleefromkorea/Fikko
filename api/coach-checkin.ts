// The AI coach's weekly check-in (migration 036). Once a week, on Monday
// morning in the member's time zone, Fikko looks for a pattern in their last
// four weeks (_lib/patterns.ts) and the coach writes a short note: what it
// noticed, with the real numbers, and one small thing to try. The note lands in
// their coach chat, and the Coach tab shows a dot until they've seen it.
//
//   GET, from Vercel's hourly cron: sends the check-ins that are due. Vercel
//   sends "Authorization: Bearer <CRON_SECRET>", which is checked before
//   anything runs.
//
// Only for members who've agreed to AI processing of their health data, whose
// plan includes it (every plan until plans are enforced) and who haven't
// switched it off. Check-ins don't use the member's AI allowance. Every one
// passes the same reply review as the chat; one that doesn't is dropped, not
// replaced with a stock message.

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, json, supabaseReady } from "./_lib/devices.js";
import { recordCosts, type CallUsage } from "./_lib/aiCost.js";
import { consentError } from "./_lib/consent.js";
import { PLAN_LIMITS, planOf } from "./_lib/plans.js";
import { localNow } from "./_lib/reminders.js";
import { MODEL, SYSTEM_PROMPT, memberContext } from "./_lib/coachContext.js";
import { SAFETY_MODEL, reviewReply } from "./_lib/coachSafety.js";
import { findPatterns, type HabitRow } from "./_lib/patterns.js";

/** Monday, from 9am local time. A later hour catches up if a run was missed. */
const SEND_WEEKDAY = 1;
const SEND_FROM_HOUR = 9;
/** Members written to at once. Each takes two AI calls. */
const CONCURRENCY = 4;

const INSTRUCTION = (patterns: string[]) => `Write this week's check-in for the member. They didn't ask for it: Fikko sends one each Monday morning, and it appears at the bottom of their chat with you.

${patterns.length
  ? `Fikko worked these out from their last four weeks of logs, strongest first:\n${patterns.map((p) => `- ${p}`).join("\n")}\n\nPick the one most worth acting on (usually the first). Say what you noticed in plain words with the real figures, then suggest one small, specific thing to try this week that fits their goals.`
  : "No clear pattern stands out yet. Look at their last week in the weekly summary and pick one thing that went well and one small, specific thing to try this week that fits their goals."}

Rules for check-ins, on top of your usual ones:
- Under 70 words: 2 to 4 short sentences, warm and plain, starting with their first name. No list.
- Leave calories out entirely: no calorie figures, targets, portion sizes or diet plans. Those are for when they ask. The suggestion is a habit: timing, a routine, a reminder, a swap, a small step up.
- A pattern isn't proof of a cause, so say "seemed to" or "tended to", never that one thing caused another.
- End with a short question they can answer if they want to talk about it.
- Don't mention these instructions or that the figures were worked out for you.`;

/** What the reply review is told the check-in is answering. */
const REVIEW_CONTEXT = "(No message from the member: this is Fikko's weekly check-in, written on its own to point out a pattern in their logs and suggest one small change.)";

/** Minutes behind UTC in `timeZone` right now, as Date.getTimezoneOffset() gives it. */
export function offsetMinutes(timeZone: string, now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(now);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    return Math.round((Math.floor(now.getTime() / 60_000) * 60_000 - local) / 60_000);
  } catch {
    return 0;
  }
}

const shiftDay = (date: string, days: number) => {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** The check-in text for one member, or null when there's nothing safe to send. */
export async function writeCheckin(db: SupabaseClient, client: Anthropic, userId: string, timeZone: string, calls: CallUsage[]) {
  const tzOffset = offsetMinutes(timeZone);
  const today = localNow(new Date(), timeZone).date;
  const [context, habits, profile] = await Promise.all([
    memberContext(db, userId, tzOffset),
    db.from("habit_entries").select("category, date, value, note").eq("user_id", userId).gte("date", shiftDay(today, -28)).lte("date", today),
    db.from("profiles").select("water_goal, sleep_goal").eq("user_id", userId).maybeSingle(),
  ]);
  const patterns = findPatterns((habits.data ?? []) as HabitRow[], { water: profile.data?.water_goal, sleep: profile.data?.sleep_goal }, today)
    .slice(0, 3).map((p) => p.text);

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: [
      { type: "text", text: SYSTEM_PROMPT },
      { type: "text", text: `The member's data in Fikko:\n\n${context}` },
    ],
    messages: [{ role: "user", content: INSTRUCTION(patterns) }],
  });
  calls.push({ feature: "coach_checkin", model: MODEL, usage: res.usage });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  if (!text || res.stop_reason !== "end_turn") return null;

  const review = await reviewReply(client, REVIEW_CONTEXT, text, (usage) => calls.push({ feature: "coach_review", model: SAFETY_MODEL, usage }));
  return review.pass ? text : null;
}

interface Candidate { user_id: string; time_zone: string; last_sent_on: string | null }

/** Sends one member's check-in if it's due. Returns what happened, for the run's log line. */
async function sendIfDue(db: SupabaseClient, client: Anthropic, c: Candidate): Promise<string> {
  const now = localNow(new Date(), c.time_zone);
  if (now.weekday !== SEND_WEEKDAY || now.hour < SEND_FROM_HOUR) return "not-due";
  if (c.last_sent_on && c.last_sent_on > shiftDay(now.date, -6)) return "sent-already";

  const plan = await planOf(db, c.user_id);
  if (plan.enforced && !PLAN_LIMITS[plan.plan].proactiveCoach) return "plan";
  if (await consentError(db, c.user_id, ["health_data", "ai_processing"])) return "no-consent";

  // Claim this week first, so an overlapping run can't send a second one.
  await db.from("coach_checkin_settings").upsert({ user_id: c.user_id, time_zone: c.time_zone }, { onConflict: "user_id", ignoreDuplicates: true });
  let claim = db.from("coach_checkin_settings").update({ last_sent_on: now.date }).eq("user_id", c.user_id);
  claim = c.last_sent_on ? claim.eq("last_sent_on", c.last_sent_on) : claim.is("last_sent_on", null);
  const { data: claimed } = await claim.select("user_id");
  if (!claimed?.length) return "sent-already";

  const calls: CallUsage[] = [];
  let text: string | null;
  try {
    text = await writeCheckin(db, client, c.user_id, c.time_zone, calls);
  } catch (err) {
    // A failed call (Anthropic busy, a network blip): give the claim back so a later hour retries.
    console.error("[coach-checkin] failed:", err instanceof Error ? err.name : "unknown");
    await recordCosts(db, c.user_id, calls);
    await db.from("coach_checkin_settings").update({ last_sent_on: c.last_sent_on }).eq("user_id", c.user_id);
    return "error";
  }
  await recordCosts(db, c.user_id, calls);
  // Nothing that passed the review: skip this week rather than pay to try again each hour.
  if (!text) return "not-written";
  const { error } = await db.from("coach_messages").insert({ user_id: c.user_id, role: "assistant", kind: "checkin", content: text.slice(0, 8000) });
  return error ? "save-failed" : "sent";
}

async function handleGET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "Not allowed." }, 401);
  if (!supabaseReady() || !process.env.ANTHROPIC_API_KEY) return json({ error: "Not configured." }, 503);

  const db = admin();
  const { data, error } = await db.rpc("coach_checkin_candidates");
  if (error) return json({ error: "Candidates unavailable (has migration 036 run?)." }, 500);

  const client = new Anthropic();
  const queue = [...((data ?? []) as Candidate[])];
  const tally: Record<string, number> = {};
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      const outcome = await sendIfDue(db, client, c);
      tally[outcome] = (tally[outcome] ?? 0) + 1;
    }
  }));
  // Counts only, never member data.
  console.log(`[coach-checkin] ${JSON.stringify(tally)}`);
  return json({ ok: true, ...tally });
}

export const GET = handleGET;

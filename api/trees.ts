// Monthly trees (migrations 037 and 038). Every calendar month in which a member
// completed every habit on every day earns a tree in their garden, and Fikko
// donates and plants a real tree for members on Max. This records each
// completed month in fikko_trees, checking the member's habit log with the same
// rule the app shows (src/lib/treeRules.ts). The row is 'pending' (a real tree
// is owed) for a member on Max when it is recorded, otherwise 'none'. If the
// plan can't be read the month is left unrecorded and tried again the next
// day, so a failure never plants a tree for the wrong member.
//
//   GET, from Vercel's daily cron: on the 2nd to the 8th of a month (UTC),
//     checks the month that just ended. By the 2nd it has ended in every time
//     zone, and checking for a week picks up days logged late. A month already
//     recorded is skipped. Vercel sends "Authorization: Bearer <CRON_SECRET>",
//     which is checked before anything runs.
//   GET ?month=YYYY-MM with the same header: checks that month instead (it must
//     be over), for catching up after an outage.
//
// Only counts are logged, never member data.

import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, json, supabaseReady } from "./_lib/devices.js";
import { monthRange, monthStatus, previousMonth, TREE_LOOKBACK_DAYS } from "../src/lib/treeRules.js";
import { shiftDateKey } from "../src/lib/dates.js";
import type { CustomHabit, HabitData, HabitEntry } from "../src/types.js";

/** Members checked at once. */
const CONCURRENCY = 8;
const CATEGORIES = ["water", "medication", "food", "exercise", "sleep", "mood"] as const;
const PAGE = 1000;
const PLANS = ["free", "premium", "max"] as const;

type Candidate = { user_id: string; water_goal: number | string | null };

/** Every row of a query, a page at a time (PostgREST returns at most 1000). */
async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

/** The member's habit log for [from, to], shaped as the app loads it (src/hooks/useHabitData.ts). */
async function habitData(db: SupabaseClient, userId: string, from: string, to: string): Promise<HabitData> {
  const [entries, customHabits, customEntries, meds, active] = await Promise.all([
    all<{ category: string; date: string; value: number }>((a, b) =>
      db.from("habit_entries").select("category, date, value").eq("user_id", userId).gte("date", from).lte("date", to)
        .order("date").order("category").range(a, b)),
    all<{ id: string; target: number }>((a, b) =>
      db.from("custom_habits").select("id, target").eq("user_id", userId).order("id").range(a, b)),
    all<{ custom_habit_id: string; date: string; value: number }>((a, b) =>
      db.from("custom_habit_entries").select("custom_habit_id, date, value").eq("user_id", userId).gte("date", from).lte("date", to)
        .order("date").order("custom_habit_id").range(a, b)),
    db.from("medications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("archived_at", null),
    all<{ date: string; value: number }>((a, b) =>
      db.from("biometric_entries").select("date, value").eq("user_id", userId).eq("metric", "activeMinutes").gte("date", from).lte("date", to)
        .order("date").order("source").range(a, b)),
  ]);
  if (meds.error) throw meds.error;

  const data = Object.fromEntries(CATEGORIES.map((c) => [c, [] as HabitEntry[]])) as Record<(typeof CATEGORIES)[number], HabitEntry[]>;
  for (const r of entries) data[r.category as (typeof CATEGORIES)[number]]?.push({ date: r.date, value: Number(r.value) });

  const byHabit = new Map<string, HabitEntry[]>();
  for (const r of customEntries) {
    const list = byHabit.get(r.custom_habit_id) ?? [];
    list.push({ date: r.date, value: Number(r.value) });
    byHabit.set(r.custom_habit_id, list);
  }
  const custom = customHabits.map((h) => ({ id: h.id, target: Number(h.target), entries: byHabit.get(h.id) ?? [] }) as CustomHabit);

  // If two devices report the same day, the first one wins, as in the app.
  const seen = new Set<string>();
  const deviceExercise = active.filter((r) => !seen.has(r.date) && seen.add(r.date)).map((r) => ({ date: r.date, value: Number(r.value) }));

  return { ...data, custom, tracksMedications: (meds.count ?? 0) > 0, deviceExercise };
}

async function handleGET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "Not allowed." }, 401);
  if (!supabaseReady()) return json({ error: "Not configured." }, 503);

  const today = new Date().toISOString().slice(0, 10);
  const asked = new URL(request.url).searchParams.get("month");
  if (asked !== null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(asked)) return json({ error: "month must be YYYY-MM." }, 400);
  const day = Number(today.slice(8));
  if (asked === null && (day < 2 || day > 8)) return json({ ok: true, skipped: "Not the start of a month." });

  const month = asked ?? previousMonth(today.slice(0, 7));
  const { from, to } = monthRange(month);
  // Over in every time zone (UTC+14 is at most a day ahead).
  if (shiftDateKey(to, 1) >= today) return json({ error: "That month isn't over yet." }, 400);

  const db = admin();
  const [candidates, recorded] = await Promise.all([
    db.rpc("fikko_tree_candidates"),
    all<{ user_id: string }>((a, b) => db.from("fikko_trees").select("user_id").eq("month", from).order("user_id").range(a, b)).catch(() => null),
  ]);
  if (candidates.error || recorded === null) return json({ error: "Unavailable (has migration 037 run?)." }, 500);

  const done = new Set(recorded.map((r) => r.user_id));
  const queue = ((candidates.data ?? []) as Candidate[]).filter((c) => !done.has(c.user_id));
  const tally = { checked: 0, trees: 0, real: 0, failed: 0, alreadyRecorded: done.size };
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      try {
        const data = await habitData(db, c.user_id, shiftDateKey(from, -TREE_LOOKBACK_DAYS), to);
        tally.checked++;
        if (!monthStatus(data, month, today, Number(c.water_goal ?? 8)).complete) continue;
        // Only a plan that was read counts; while plans aren't enforced everyone is Max.
        const state = await db.rpc("plan_state", { p_user: c.user_id });
        const plan = (state.data as { plan?: unknown } | null)?.plan;
        if (state.error || !PLANS.includes(plan as (typeof PLANS)[number])) throw state.error ?? new Error("No plan");
        const real = plan === "max";
        const { error } = await db.from("fikko_trees").upsert(
          { user_id: c.user_id, month: from, plan, status: real ? "pending" : "none" },
          { onConflict: "user_id,month", ignoreDuplicates: true },
        );
        if (error) throw error;
        tally.trees++;
        if (real) tally.real++;
      } catch {
        tally.failed++;
      }
    }
  }));
  console.log(`[trees] ${month} ${JSON.stringify(tally)}`);
  return json({ ok: true, month, ...tally });
}

export const GET = handleGET;

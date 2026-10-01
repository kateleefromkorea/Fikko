import type { CustomHabit, HabitData, HabitEntry, MealKey } from "../types";
import { CORE_HABITS, completion, coreDone, type CoreHabit } from "./completion";
import { daysAgoKey } from "./dates";

/**
 * Everything the Dashboard works out from what a member has logged. Pure
 * functions over HabitData, so the page can memoise them per period.
 */

export type Period = "week" | "month" | "year";
export const PERIOD_DAYS: Record<Period, number> = { week: 7, month: 30, year: 365 };

// How far back a streak is looked for. useHabitData loads 400 days.
const HISTORY_DAYS = 400;

/** YYYY-MM-DD `daysAgo` days before today, in local time like the rest of the app. */
export const dateKey = daysAgoKey;

/** The `n` days ending `offset` days ago, oldest first. */
export function dayRange(n: number, offset = 0): string[] {
  return Array.from({ length: n }, (_, i) => dateKey(offset + n - 1 - i));
}

export function parseJSON<T>(raw?: string): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export function avgOf(nums: number[]): number | null {
  return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : null;
}

/** Looks entries up by date without scanning the list each time. */
export function byDate(entries: HabitEntry[]): Map<string, HabitEntry> {
  return new Map(entries.map((e) => [e.date, e]));
}

// ── Completion ─────────────────────────────────────────────────────────────

export function customDone(habit: CustomHabit, date: string): boolean {
  return (habit.entries.find((e) => e.date === date)?.value ?? 0) >= habit.target;
}

/** Any habit touched on this day, done or not. */
export function loggedOn(data: HabitData, date: string): boolean {
  return (
    CORE_HABITS.some((k) => data[k].some((e) => e.date === date)) ||
    data.custom.some((h) => h.entries.some((e) => e.date === date && e.value > 0))
  );
}

export interface Overview {
  days: number;
  /** Share of all habit-days completed, 0–1. */
  rate: number;
  logged: number;
  perfect: number;
  /** Habits done per day, for the completion chart. */
  perDay: { date: string; done: number; total: number }[];
}

export function overview(data: HabitData, dates: string[], waterTarget?: number): Overview {
  const perDay = dates.map((date) => {
    const { done, total } = completion(data, date, waterTarget);
    return { date, done, total };
  });
  const done = perDay.reduce((s, d) => s + d.done, 0);
  const possible = perDay.reduce((s, d) => s + d.total, 0);
  return {
    days: dates.length,
    rate: possible ? done / possible : 0,
    logged: dates.filter((d) => loggedOn(data, d)).length,
    perfect: perDay.filter((d) => d.total > 0 && d.done === d.total).length,
    perDay,
  };
}

/**
 * Consecutive days a test holds, counting back from today. Today still being
 * in progress doesn't break a streak, so an unfinished today starts the count
 * from yesterday.
 */
export function currentStreak(test: (date: string) => boolean): number {
  let i = test(dateKey(0)) ? 0 : 1;
  let n = 0;
  while (i < HISTORY_DAYS && test(dateKey(i))) { n++; i++; }
  return n;
}

export function longestStreak(test: (date: string) => boolean): number {
  let best = 0;
  let run = 0;
  for (const date of dayRange(HISTORY_DAYS)) {
    run = test(date) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

export interface HabitStat {
  /** A core habit key, or a custom habit's id. */
  key: CoreHabit | string;
  custom?: CustomHabit;
  done: number;
  rate: number;
  /** The same rate over the period before, or null when nothing was logged then. */
  prevRate: number | null;
  streak: number;
}

export function habitStats(data: HabitData, dates: string[], prevDates: string[], prevLogged: boolean, waterTarget?: number): HabitStat[] {
  const stat = (key: string, test: (date: string) => boolean, custom?: CustomHabit): HabitStat => {
    const done = dates.filter(test).length;
    return {
      key,
      custom,
      done,
      rate: dates.length ? done / dates.length : 0,
      prevRate: prevLogged && prevDates.length ? prevDates.filter(test).length / prevDates.length : null,
      streak: currentStreak(test),
    };
  };
  return [
    ...CORE_HABITS.map((k) => stat(k, (d) => coreDone(data, k, d, waterTarget))),
    ...data.custom.map((h) => stat(h.id, (d) => customDone(h, d), h)),
  ];
}

// ── Chart series ───────────────────────────────────────────────────────────

export interface Point { label: string; value: number }

/**
 * One point per day for a week or month, one per calendar month for a year.
 * `valueOf` returns null for a day with nothing logged: daily charts draw
 * that as zero, and monthly points average only the days that have a value
 * unless `countEmpty` says an empty day is a real zero (as for completion).
 */
export function buildSeries(
  dates: string[],
  period: Period,
  valueOf: (date: string) => number | null,
  countEmpty = false,
): Point[] {
  if (period !== "year") {
    return dates.map((date, i) => {
      const d = new Date(date + "T00:00:00");
      const label = period === "week"
        ? (i === dates.length - 1 ? "Today" : d.toLocaleDateString("en-US", { weekday: "short" }))
        : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return { label, value: valueOf(date) ?? 0 };
    });
  }
  const months = new Map<string, number[]>();
  for (const date of dates) {
    const key = date.slice(0, 7);
    if (!months.has(key)) months.set(key, []);
    const v = valueOf(date);
    if (v != null) months.get(key)!.push(v);
    else if (countEmpty) months.get(key)!.push(0);
  }
  return [...months.entries()].map(([key, vals]) => ({
    label: new Date(key + "-01T00:00:00").toLocaleDateString("en-US", { month: "short" }),
    value: Math.round((avgOf(vals) ?? 0) * 10) / 10,
  }));
}

/** Values logged within the given days. */
export function valuesIn(entries: HabitEntry[], dates: string[], keep: (e: HabitEntry) => boolean = () => true): number[] {
  const set = new Set(dates);
  return entries.filter((e) => set.has(e.date) && keep(e)).map((e) => e.value);
}

// ── Nutrition ──────────────────────────────────────────────────────────────

export type MealCalories = Record<MealKey, number>;

/** Average calories per meal across the days any food was logged. */
export function mealAverages(food: HabitEntry[], dates: string[]): MealCalories | null {
  const set = new Set(dates);
  const days = food
    .filter((e) => set.has(e.date) && e.value > 0)
    .map((e) => parseJSON<MealCalories>(e.note))
    .filter((m): m is MealCalories => m != null);
  if (!days.length) return null;
  const sum = (k: MealKey) => days.reduce((s, m) => s + (Number(m[k]) || 0), 0) / days.length;
  return { breakfast: sum("breakfast"), lunch: sum("lunch"), dinner: sum("dinner"), snacks: sum("snacks") };
}

// ── Sleep ──────────────────────────────────────────────────────────────────

function toMinutes(time?: string): number | null {
  const m = time?.match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Hours between a bedtime and a wake time, crossing midnight when needed. */
export function sleepHours(bedtime?: string, wake?: string): number | null {
  const b = toMinutes(bedtime);
  const w = toMinutes(wake);
  if (b == null || w == null) return null;
  const mins = (w - b + 1440) % 1440;
  // Anything outside 1–16 hours is almost certainly a typo, so leave it out.
  return mins >= 60 && mins <= 960 ? mins / 60 : null;
}

/**
 * Average of clock times. Bedtimes straddle midnight, so for them the small
 * hours count as the night before (1:00 averages with 23:00 to midnight, not noon).
 */
export function averageClock(times: string[], bedtime: boolean): string | null {
  const mins = times
    .map(toMinutes)
    .filter((m): m is number => m != null)
    .map((m) => (bedtime && m < 12 * 60 ? m + 1440 : m));
  const a = avgOf(mins);
  if (a == null) return null;
  const total = Math.round(a) % 1440;
  const d = new Date(2000, 0, 1, Math.floor(total / 60), total % 60);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// ── Comparisons ────────────────────────────────────────────────────────────

export interface Split { withAvg: number; withoutAvg: number; withN: number; withoutN: number }

/**
 * Averages a metric on the days a condition held against the days it didn't.
 * Null unless both sides have at least `min` days, so a single odd day can't
 * make a pattern.
 */
export function split(
  dates: string[],
  condition: (date: string) => boolean | null,
  metric: (date: string) => number | null,
  min = 2,
): Split | null {
  const yes: number[] = [];
  const no: number[] = [];
  for (const date of dates) {
    const c = condition(date);
    const m = metric(date);
    if (c == null || m == null) continue;
    (c ? yes : no).push(m);
  }
  if (yes.length < min || no.length < min) return null;
  return { withAvg: avgOf(yes)!, withoutAvg: avgOf(no)!, withN: yes.length, withoutN: no.length };
}

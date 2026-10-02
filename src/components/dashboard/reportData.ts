import { CalendarCheck, Footprints, HeartPulse, TrendingDown, TrendingUp, Trophy, Utensils } from "lucide-react";
import type { BiometricData, BiometricEntry, CustomHabit, HabitData } from "../../types";
import type { ProfileRow } from "../../hooks/useProfile";
import type { SleepNote } from "../HabitsView";
import { CORE_HABITS, EXERCISE_TARGET_MIN, WATER_TARGET, type CoreHabit } from "../../lib/completion";
import {
  avgOf, byDate, habitStats, overview, parseJSON, sleepHours, valuesIn,
} from "../../lib/dashboardStats";
import { periodRange, shiftDateKey, todayKey } from "../../lib/dates";
import { patternItems, type Pattern } from "./DashboardSections";
import { HABIT_INFO, kcal, moodLabel, one, pct, plural, restLabel, type DashCtx } from "./context";

// The weekly report: how last Monday-to-Sunday went, worked out from what the
// member logged. Everything here is rule-based and runs in the browser.

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** How far back past reports can be browsed. */
export const MAX_WEEKS_BACK = 52;
/** Days of history the report's patterns look at, ending with the report's Sunday. */
const PATTERN_DAYS = 28;

export interface ReportWeek { from: string; to: string; dates: string[] }

/** "21–27 September 2026", or "28 September – 4 October 2026" across months. */
export function weekLabel({ from, to }: { from: string; to: string }) {
  const f = new Date(from + "T12:00:00");
  const t = new Date(to + "T12:00:00");
  const month = (d: Date) => d.toLocaleDateString(undefined, { month: "long" });
  if (f.getMonth() === t.getMonth()) return `${f.getDate()}–${t.getDate()} ${month(t)} ${t.getFullYear()}`;
  const startYear = f.getFullYear() === t.getFullYear() ? "" : ` ${f.getFullYear()}`;
  return `${f.getDate()} ${month(f)}${startYear} – ${t.getDate()} ${month(t)} ${t.getFullYear()}`;
}

/** The Monday-to-Sunday week `weeksAgo` full weeks back; 0 is the most recent finished week. */
export function reportWeek(weeksAgo: number): ReportWeek {
  const thisMonday = periodRange("week", todayKey()).from;
  const from = shiftDateKey(thisMonday, -7 * (weeksAgo + 1));
  const dates = Array.from({ length: 7 }, (_, i) => shiftDateKey(from, i));
  return { from, to: dates[6], dates };
}

/** The Monday the next report appears. */
export const nextReportDate = () => shiftDateKey(periodRange("week", todayKey()).from, 7);

/** How many weeks back there is anything to report on, up to MAX_WEEKS_BACK. */
export function weeksWithHistory(data: HabitData): number {
  const all = [
    ...CORE_HABITS.flatMap((k) => data[k].map((e) => e.date)),
    ...data.custom.flatMap((h) => h.entries.filter((e) => e.value > 0).map((e) => e.date)),
  ];
  if (!all.length) return 0;
  const earliest = all.reduce((a, b) => (a < b ? a : b));
  // Started this week: the first report is next Monday's.
  if (earliest > reportWeek(0).to) return 0;
  for (let w = 0; w < MAX_WEEKS_BACK; w++) if (reportWeek(w).from <= earliest) return w + 1;
  return MAX_WEEKS_BACK;
}

/** The context the Dashboard's pattern rules expect, for any run of days. */
function ctxFor(data: HabitData, profile: ProfileRow | undefined, dates: string[], waterTarget: number): DashCtx {
  return {
    data, profile, period: "month", dates, prevDates: [], prevOv: null, waterTarget,
    ov: overview(data, dates, waterTarget),
    stats: [],
    m: Object.fromEntries(CORE_HABITS.map((k) => [k, byDate(data[k])])) as DashCtx["m"],
  };
}

// ── Per-habit figures ──────────────────────────────────────────────────────

export interface HabitRow {
  key: string;
  label: string;
  core?: CoreHabit;
  custom?: CustomHabit;
  /** Days the habit was done, out of 7. */
  done: number;
  prevDone: number | null;
  /** The week's headline figure for this habit, e.g. "1,820 kcal a day". */
  figure: string;
}

function figureFor(key: CoreHabit, data: HabitData, dates: string[], profile?: ProfileRow): string {
  switch (key) {
    case "food": {
      const avg = avgOf(valuesIn(data.food, dates, (e) => e.value > 0));
      if (avg == null) return "No meals logged";
      return `${kcal(avg)} kcal a day${profile?.calorie_goal ? ` · target ${kcal(profile.calorie_goal)}` : ""}`;
    }
    case "exercise": {
      const total = valuesIn(data.exercise, dates).reduce((s, v) => s + v, 0);
      return total ? `${kcal(total)} active minutes` : "No activity logged";
    }
    case "water": {
      const avg = avgOf(valuesIn(data.water, dates, (e) => e.value > 0));
      return avg == null ? "No water logged" : `${one(avg)} glasses a day`;
    }
    case "sleep": {
      const rest = avgOf(valuesIn(data.sleep, dates, (e) => e.value > 0));
      if (rest == null) return "No sleep logged";
      const byDay = byDate(data.sleep);
      const hours = avgOf(dates
        .map((d) => { const n = parseJSON<SleepNote>(byDay.get(d)?.note); return sleepHours(n?.bedtime, n?.wake); })
        .filter((h): h is number => h != null));
      return `${restLabel(rest)} on average${hours != null ? ` · ${one(hours)}h a night` : ""}`;
    }
    case "mood": {
      const avg = avgOf(valuesIn(data.mood, dates, (e) => e.value > 0));
      return avg == null ? "No check-ins" : `${moodLabel(avg)} on average (${one(avg)} / 5)`;
    }
    case "medication":
      return "Days everything was taken";
  }
}

// ── Wearable ───────────────────────────────────────────────────────────────

export interface WearableFigure {
  label: string;
  value: string;
  unit: string;
  /** Change on the week before, in the figure's own unit, or null. */
  change: number | null;
  /** Unit for the change, e.g. "steps". */
  deltaUnit: string;
  goodWhen: "up" | "down";
}

function weekAvg(series: BiometricEntry[], dates: string[]) {
  const set = new Set(dates);
  return avgOf(series.filter((e) => set.has(e.date)).map((e) => e.value));
}

function wearableFigures(bm: BiometricData, dates: string[], prevDates: string[]): WearableFigure[] {
  const sleepSeries = (ds: string[]) => {
    const total = new Map<string, number>();
    for (const s of [bm.sleepRem, bm.sleepDeep, bm.sleepCore]) {
      for (const e of s) if (ds.includes(e.date)) total.set(e.date, (total.get(e.date) ?? 0) + e.value);
    }
    return [...total.entries()].map(([date, value]) => ({ date, value }));
  };
  const rows: { label: string; unit: string; deltaUnit: string; goodWhen: "up" | "down"; now: number | null; prev: number | null; fmt: (v: number) => string }[] = [
    { label: "Steps", unit: "a day", deltaUnit: "steps", goodWhen: "up", now: weekAvg(bm.steps, dates), prev: weekAvg(bm.steps, prevDates), fmt: kcal },
    { label: "Sleep", unit: "h a night", deltaUnit: "h", goodWhen: "up", now: weekAvg(sleepSeries(dates), dates), prev: weekAvg(sleepSeries(prevDates), prevDates), fmt: one },
    { label: "Resting heart rate", unit: "bpm", deltaUnit: "bpm", goodWhen: "down", now: weekAvg(bm.heartRate, dates), prev: weekAvg(bm.heartRate, prevDates), fmt: kcal },
    { label: "HRV", unit: "ms", deltaUnit: "ms", goodWhen: "up", now: weekAvg(bm.hrv, dates), prev: weekAvg(bm.hrv, prevDates), fmt: kcal },
    { label: "Active calories", unit: "kcal a day", deltaUnit: "kcal", goodWhen: "up", now: weekAvg(bm.activeCalories, dates), prev: weekAvg(bm.activeCalories, prevDates), fmt: kcal },
  ];
  return rows
    .filter((r) => r.now != null)
    .map((r) => ({
      label: r.label,
      value: r.fmt(r.now!),
      unit: r.unit,
      deltaUnit: r.deltaUnit,
      change: r.prev != null ? r.now! - r.prev : null,
      goodWhen: r.goodWhen,
    }));
}

// ── Focus for next week ────────────────────────────────────────────────────

const FOCUS_TIPS: Record<CoreHabit, (target: number, waterGoal: number) => string> = {
  food: (n) => `Log at least one meal on ${n} days. Breakfast is the easiest one to remember.`,
  exercise: (n) => `Get ${EXERCISE_TARGET_MIN} active minutes on ${n} days. A brisk walk counts.`,
  water: (n, goal) => `Reach ${goal} glasses on ${n} days. Keeping a bottle where you work makes it easier.`,
  mood: (n) => `Check in on your mood on ${n} days. It takes five seconds and makes your patterns clearer.`,
  medication: (n) => `Take everything on ${n} days. Ticking it off straight after helps it stick.`,
  sleep: (n) => `Wake up rested on ${n} days. A regular bedtime is the most reliable lever.`,
};

export interface Focus { label: string; text: string }

// ── The report ─────────────────────────────────────────────────────────────

export interface WeeklyReport {
  week: ReportWeek;
  /** "22 – 28 September 2026". */
  label: string;
  logged: number;
  perfect: number;
  rate: number;
  prevRate: number | null;
  headline: string;
  summary: string;
  highlights: Pattern[];
  watch: Pattern[];
  habits: HabitRow[];
  wearable: WearableFigure[];
  patterns: Pattern[];
  focus: Focus | null;
}

function headlineFor(rate: number, logged: number) {
  if (logged === 0) return "Nothing logged this week";
  if (rate >= 0.8) return "An excellent week";
  if (rate >= 0.6) return "A strong week";
  if (rate >= 0.4) return "A steady week";
  return "A light week";
}

export function buildWeeklyReport(
  data: HabitData, biometrics: BiometricData, profile: ProfileRow | undefined, weeksAgo: number,
): WeeklyReport {
  const week = reportWeek(weeksAgo);
  const prev = reportWeek(weeksAgo + 1);
  const waterTarget = profile?.water_goal ?? WATER_TARGET;
  const ov = overview(data, week.dates, waterTarget);
  const prevOv = overview(data, prev.dates, waterTarget);
  const prevLogged = prevOv.logged > 0;
  const prevRate = prevLogged ? prevOv.rate : null;
  const stats = habitStats(data, week.dates, prev.dates, prevLogged, waterTarget);

  const habits: HabitRow[] = stats.map((s) => {
    const core = s.custom ? undefined : (s.key as CoreHabit);
    return {
      key: s.key,
      label: s.custom ? s.custom.name : HABIT_INFO[core!].label,
      core,
      custom: s.custom,
      done: s.done,
      prevDone: s.prevRate == null ? null : Math.round(s.prevRate * 7),
      figure: core ? figureFor(core, data, week.dates, profile) : `Target ${s.custom!.target} ${s.custom!.unit} a day`,
    };
  });

  // ── Summary ──
  const ranked = [...habits].sort((a, b) => b.done - a.done);
  let summary: string;
  if (ov.logged === 0) {
    summary = "You didn't log anything this week. Check in on the Habits page and next Monday's report fills in.";
  } else {
    summary = `You logged ${ov.logged} of 7 days and completed ${pct(ov.rate)} of your habits`;
    if (prevRate != null) {
      const diff = Math.round((ov.rate - prevRate) * 100);
      summary += diff === 0 ? ", the same as the week before." : `, ${diff > 0 ? "up" : "down"} ${Math.abs(diff)} points on the week before.`;
    } else summary += ".";
    if (ranked[0]?.done > 0) summary += ` ${ranked[0].label} was your most consistent habit.`;
  }

  // ── Highlights and things to watch ──
  const highlights: Pattern[] = [];
  const watch: Pattern[] = [];
  if (prevRate != null) {
    const diff = Math.round((ov.rate - prevRate) * 100);
    if (diff >= 5) highlights.push({ id: "up", icon: TrendingUp, text: `Consistency rose ${diff} points, from ${pct(prevRate)} to ${pct(ov.rate)}.` });
    if (diff <= -5) watch.push({ id: "down", icon: TrendingDown, text: `Consistency slipped ${-diff} points, from ${pct(prevRate)} to ${pct(ov.rate)}.` });
  }
  for (const h of habits) {
    if (h.done === 7) highlights.push({ id: `all-${h.key}`, icon: Trophy, text: `${h.label}: done every day this week.` });
    else if (h.prevDone != null && h.done - h.prevDone >= 2) {
      highlights.push({ id: `more-${h.key}`, icon: TrendingUp, text: `${h.label} went from ${plural(h.prevDone, "day")} to ${h.done}.` });
    }
    if (h.prevDone != null && h.prevDone - h.done >= 2) {
      watch.push({ id: `less-${h.key}`, icon: TrendingDown, text: `${h.label} dropped from ${plural(h.prevDone, "day")} to ${h.done}.` });
    }
  }
  if (ov.perfect > 0) highlights.push({ id: "perfect", icon: CalendarCheck, text: `${plural(ov.perfect, "perfect day")} with every habit done.` });
  const best = ov.perDay.reduce<(typeof ov.perDay)[number] | null>((b, d) => (d.done > (b?.done ?? 0) ? d : b), null);
  if (best && best.done > 0 && ov.perfect === 0) {
    highlights.push({ id: "best", icon: Trophy, text: `Your best day was ${DAY_NAMES[new Date(best.date + "T12:00:00").getDay()]}, with ${best.done} of ${best.total} habits done.` });
  }
  const calAvg = avgOf(valuesIn(data.food, week.dates, (e) => e.value > 0));
  const goal = profile?.calorie_goal;
  if (calAvg != null && goal && Math.abs(calAvg - goal) > goal * 0.15) {
    watch.push({
      id: "calories", icon: Utensils,
      text: `Calories averaged ${kcal(calAvg)} on logged days, about ${kcal(Math.abs(calAvg - goal))} ${calAvg > goal ? "above" : "below"} your ${kcal(goal)} target.`,
    });
  }

  // ── Wearable, patterns, focus ──
  const wearable = wearableFigures(biometrics, week.dates, prev.dates);
  if (wearable.length) {
    const steps = wearable.find((w) => w.label === "Steps");
    if (steps?.change != null && Math.abs(steps.change) >= 1000) {
      (steps.change > 0 ? highlights : watch).push({
        id: "steps", icon: Footprints,
        text: `Steps ${steps.change > 0 ? "rose" : "fell"} by about ${kcal(Math.abs(steps.change))} a day on the week before.`,
      });
    }
    const hr = wearable.find((w) => w.label === "Resting heart rate");
    if (hr?.change != null && hr.change >= 3) {
      watch.push({ id: "hr", icon: HeartPulse, text: `Resting heart rate was ${Math.round(hr.change)} bpm higher than the week before. Stress, illness or short sleep can all do this.` });
    }
  }

  const patternDates = Array.from({ length: PATTERN_DAYS }, (_, i) => shiftDateKey(week.to, i - PATTERN_DAYS + 1));
  const patterns = ov.logged ? patternItems(ctxFor(data, profile, patternDates, waterTarget), { relative: false }) : [];

  // The habit with the most room to grow, among those the member actually
  // uses: anything logged in the last four weeks, or every core habit if new.
  const recent = new Set(patternDates);
  const used = habits.filter((h) =>
    h.custom
      ? h.custom.entries.some((e) => recent.has(e.date) && e.value > 0)
      : data[h.core!].some((e) => recent.has(e.date)),
  );
  const pool = (used.length ? used : habits).filter((h) => h.done < 7);
  const pick = pool.length ? pool.reduce((a, b) => (b.done < a.done ? b : a)) : null;
  let focus: Focus | null = null;
  if (pick && ov.logged > 0) {
    const target = Math.min(7, Math.max(4, pick.done + 2));
    focus = {
      label: pick.label,
      text: pick.core
        ? FOCUS_TIPS[pick.core](target, waterTarget)
        : `Hit ${pick.custom!.target} ${pick.custom!.unit} on ${target} days.`,
    };
  } else if (!pick && ov.logged > 0) {
    focus = { label: "Keep it up", text: "Every habit was done every day. Keep the same rhythm next week." };
  }

  return {
    week,
    label: weekLabel(week),
    logged: ov.logged,
    perfect: ov.perfect,
    rate: ov.rate,
    prevRate,
    headline: headlineFor(ov.rate, ov.logged),
    summary,
    highlights: highlights.slice(0, 4),
    watch: watch.slice(0, 3),
    habits,
    wearable,
    patterns,
    focus,
  };
}

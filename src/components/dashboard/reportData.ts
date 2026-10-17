import { CalendarCheck, Footprints, HeartPulse, TrendingDown, TrendingUp, Trophy, Utensils } from "lucide-react";
import type { BiometricData, BiometricEntry, CustomHabit, HabitData } from "../../types";
import type { ProfileRow } from "../../hooks/useProfile";
import type { SleepNote } from "../HabitsView";
import { CORE_HABITS, EXERCISE_TARGET_MIN, WATER_TARGET, type CoreHabit } from "../../lib/completion";
import {
  avgOf, byDate, habitStats, overview, parseJSON, sleepHours, valuesIn,
} from "../../lib/dashboardStats";
import { localDateKey, periodRange, shiftDateKey, todayKey } from "../../lib/dates";
import { patternItems, type Pattern } from "./DashboardSections";
import { HABIT_INFO, kcal, moodLabel, one, pct, plural, restLabel, type DashCtx } from "./context";

// The report: how the last finished week (Monday to Sunday), calendar month or
// 12 months went, worked out from what the member logged. Everything here is
// rule-based and runs in the browser.

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** Which stretch a report covers: the last finished week, month, or 12 months. */
export type ReportPeriod = "week" | "month" | "year";

export const REPORT_NAME: Record<ReportPeriod, string> = { week: "Weekly", month: "Monthly", year: "Yearly" };

/** What comes after a report: the yearly one rolls on every month, so it looks to the months ahead. */
export const REPORT_NEXT: Record<ReportPeriod, string> = { week: "next week", month: "next month", year: "the months ahead" };

/** How far back past reports can be browsed. The app keeps about 13 months of history. */
const MAX_BACK: Record<ReportPeriod, number> = { week: 52, month: 12, year: 1 };
/** Days of history the weekly report's patterns look at, ending with the report's Sunday. */
const PATTERN_DAYS = 28;

export interface ReportSpan { from: string; to: string; dates: string[] }
export type ReportWeek = ReportSpan;

/** "21–27 September 2026", or "28 September – 4 October 2026" across months. */
export function weekLabel({ from, to }: { from: string; to: string }) {
  const f = new Date(from + "T12:00:00");
  const t = new Date(to + "T12:00:00");
  const month = (d: Date) => d.toLocaleDateString(undefined, { month: "long" });
  if (f.getMonth() === t.getMonth()) return `${f.getDate()}–${t.getDate()} ${month(t)} ${t.getFullYear()}`;
  const startYear = f.getFullYear() === t.getFullYear() ? "" : ` ${f.getFullYear()}`;
  return `${f.getDate()} ${month(f)}${startYear} – ${t.getDate()} ${month(t)} ${t.getFullYear()}`;
}

/** The first day of the month `delta` months from the one containing `key`. */
function monthStart(key: string, delta: number) {
  const d = new Date(key + "T12:00:00");
  return localDateKey(new Date(d.getFullYear(), d.getMonth() + delta, 1));
}

const monthYear = (key: string) => new Date(key + "T12:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" });

/** "5–11 October 2026", "September 2026", or "October 2025 – September 2026". */
export function spanLabel(period: ReportPeriod, { from, to }: { from: string; to: string }) {
  if (period === "week") return weekLabel({ from, to });
  return period === "month" ? monthYear(from) : `${monthYear(from)} – ${monthYear(to)}`;
}

/** The Monday-to-Sunday week `weeksAgo` full weeks back; 0 is the most recent finished week. */
export function reportWeek(weeksAgo: number): ReportSpan {
  const thisMonday = periodRange("week", todayKey()).from;
  const from = shiftDateKey(thisMonday, -7 * (weeksAgo + 1));
  const dates = Array.from({ length: 7 }, (_, i) => shiftDateKey(from, i));
  return { from, to: dates[6], dates };
}

/**
 * The span a report covers, `back` periods back; 0 is the most recent finished
 * one: last Monday-to-Sunday week, last calendar month, or the last 12
 * finished months.
 */
export function reportSpan(period: ReportPeriod, back: number): ReportSpan {
  if (period === "week") return reportWeek(back);
  const months = period === "month" ? 1 : 12;
  const thisMonth = monthStart(todayKey(), 0);
  const from = monthStart(thisMonth, -months * (back + 1));
  const to = shiftDateKey(monthStart(thisMonth, -months * back), -1);
  const dates: string[] = [];
  for (let d = from; d <= to; d = shiftDateKey(d, 1)) dates.push(d);
  return { from, to, dates };
}

/** The day the next report appears: the next Monday, or the 1st of next month. */
export function nextReportDate(period: ReportPeriod = "week") {
  return period === "week" ? shiftDateKey(periodRange("week", todayKey()).from, 7) : monthStart(todayKey(), 1);
}

/** The first day the member logged anything, or null. */
function firstLogDate(data: HabitData): string | null {
  const all = [
    ...CORE_HABITS.flatMap((k) => data[k].map((e) => e.date)),
    ...data.custom.flatMap((h) => h.entries.filter((e) => e.value > 0).map((e) => e.date)),
  ];
  return all.length ? all.reduce((a, b) => (a < b ? a : b)) : null;
}

/** How many periods back there is anything to report on, up to the most the app keeps. */
export function periodsWithHistory(data: HabitData, period: ReportPeriod): number {
  const earliest = firstLogDate(data);
  if (!earliest) return 0;
  // Started inside the current period: the first report comes when it finishes.
  if (earliest > reportSpan(period, 0).to) return 0;
  for (let b = 0; b < MAX_BACK[period]; b++) if (reportSpan(period, b).from <= earliest) return b + 1;
  return MAX_BACK[period];
}

/** How many weeks back there is anything to report on. */
export const weeksWithHistory = (data: HabitData) => periodsWithHistory(data, "week");

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
  /** Days the habit was done, out of the days in the report. */
  done: number;
  prevDone: number | null;
  /** The period's headline figure for this habit, e.g. "1,820 kcal a day". */
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
  /** Change on the period before, in the figure's own unit, or null. */
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

// ── Focus for next time ────────────────────────────────────────────────────

/** Each tip takes how often, e.g. "5 days" or "5 days a week". */
const FOCUS_TIPS: Record<CoreHabit, (when: string, waterGoal: number) => string> = {
  food: (n) => `Log at least one meal on ${n}. Breakfast is the easiest one to remember.`,
  exercise: (n) => `Get ${EXERCISE_TARGET_MIN} active minutes on ${n}. A brisk walk counts.`,
  water: (n, goal) => `Reach ${goal} glasses on ${n}. Keeping a bottle where you work makes it easier.`,
  mood: (n) => `Check in on your mood on ${n}. It takes five seconds and makes your patterns clearer.`,
  medication: (n) => `Take everything on ${n}. Ticking it off straight after helps it stick.`,
  sleep: (n) => `Wake up rested on ${n}. A regular bedtime is the most reliable lever.`,
};

export interface Focus { label: string; text: string }

// ── The report ─────────────────────────────────────────────────────────────

export interface PeriodReport {
  period: ReportPeriod;
  span: ReportSpan;
  /** Days in the report: 7, a month's, or a year's. */
  days: number;
  /** "22 – 28 September 2026", "September 2026" or "October 2025 – September 2026". */
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
export type WeeklyReport = PeriodReport;

function headlineFor(rate: number, logged: number, noun: string) {
  if (logged === 0) return `Nothing logged this ${noun}`;
  if (rate >= 0.8) return `An excellent ${noun}`;
  if (rate >= 0.6) return `A strong ${noun}`;
  if (rate >= 0.4) return `A steady ${noun}`;
  return `A light ${noun}`;
}

export function buildReport(
  period: ReportPeriod, data: HabitData, biometrics: BiometricData, profile: ProfileRow | undefined, back: number,
): PeriodReport {
  const noun = period;
  const span = reportSpan(period, back);
  const prevSpan = reportSpan(period, back + 1);
  // Days before the member started don't count against them: a first month or
  // year is scored from their first check-in.
  const start = firstLogDate(data);
  const from = (ds: string[]) => (start ? ds.filter((d) => d >= start) : ds);
  const dates = from(span.dates).length ? from(span.dates) : span.dates;
  const prevDates = from(prevSpan.dates);
  const joinedDuring = dates.length < span.dates.length;
  const len = dates.length;
  const waterTarget = profile?.water_goal ?? WATER_TARGET;
  const ov = overview(data, dates, waterTarget);
  const prevOv = overview(data, prevDates, waterTarget);
  // The app keeps about 13 months, so a year has nothing complete to be compared with.
  const prevLogged = period !== "year" && prevOv.logged > 0;
  const prevRate = prevLogged ? prevOv.rate : null;
  const stats = habitStats(data, dates, prevDates, prevLogged, waterTarget);

  const habits: HabitRow[] = stats.map((s) => {
    const core = s.custom ? undefined : (s.key as CoreHabit);
    return {
      key: s.key,
      label: s.custom ? s.custom.name : HABIT_INFO[core!].label,
      core,
      custom: s.custom,
      done: s.done,
      prevDone: s.prevRate == null ? null : Math.round(s.prevRate * len),
      figure: core ? figureFor(core, data, dates, profile) : `Target ${s.custom!.target} ${s.custom!.unit} a day`,
    };
  });
  // A two-day swing in a week, scaled to the period.
  const bigChange = (a: number, b: number) => Math.abs(a - b) / len >= 2 / 7 - 0.001;

  // ── Summary ──
  const ranked = [...habits].sort((a, b) => b.done - a.done);
  let summary: string;
  if (ov.logged === 0) {
    summary = `You didn't log anything this ${noun}. Check in on the Today page and the next ${REPORT_NAME[period].toLowerCase()} report fills in.`;
  } else {
    const since = new Date(dates[0] + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "long" });
    summary = `You logged ${ov.logged} of ${joinedDuring ? `the ${len} days since you started on ${since}` : `${len} days`} and completed ${pct(ov.rate)} of your habits`;
    if (prevRate != null) {
      const diff = Math.round((ov.rate - prevRate) * 100);
      summary += diff === 0 ? `, the same as the ${noun} before.` : `, ${diff > 0 ? "up" : "down"} ${Math.abs(diff)} points on the ${noun} before.`;
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
    if (h.done === len) highlights.push({ id: `all-${h.key}`, icon: Trophy, text: `${h.label}: done every day this ${noun}.` });
    else if (h.prevDone != null && h.done > h.prevDone && bigChange(h.done, h.prevDone)) {
      highlights.push({ id: `more-${h.key}`, icon: TrendingUp, text: `${h.label} went from ${plural(h.prevDone, "day")} to ${h.done}.` });
    }
    if (h.prevDone != null && h.done < h.prevDone && bigChange(h.done, h.prevDone)) {
      watch.push({ id: `less-${h.key}`, icon: TrendingDown, text: `${h.label} dropped from ${plural(h.prevDone, "day")} to ${h.done}.` });
    }
  }
  if (ov.perfect > 0) highlights.push({ id: "perfect", icon: CalendarCheck, text: `${plural(ov.perfect, "perfect day")} with every habit done.` });
  const best = ov.perDay.reduce<(typeof ov.perDay)[number] | null>((b, d) => (d.done > (b?.done ?? 0) ? d : b), null);
  if (period === "week" && best && best.done > 0 && ov.perfect === 0) {
    highlights.push({ id: "best", icon: Trophy, text: `Your best day was ${DAY_NAMES[new Date(best.date + "T12:00:00").getDay()]}, with ${best.done} of ${best.total} habits done.` });
  }
  const calAvg = avgOf(valuesIn(data.food, dates, (e) => e.value > 0));
  const goal = profile?.calorie_goal;
  if (calAvg != null && goal && Math.abs(calAvg - goal) > goal * 0.15) {
    watch.push({
      id: "calories", icon: Utensils,
      text: `Calories averaged ${kcal(calAvg)} on logged days, about ${kcal(Math.abs(calAvg - goal))} ${calAvg > goal ? "above" : "below"} your ${kcal(goal)} target.`,
    });
  }

  // ── Wearable, patterns, focus ──
  const wearable = wearableFigures(biometrics, dates, prevDates);
  if (wearable.length) {
    const steps = wearable.find((w) => w.label === "Steps");
    if (steps?.change != null && Math.abs(steps.change) >= 1000) {
      (steps.change > 0 ? highlights : watch).push({
        id: "steps", icon: Footprints,
        text: `Steps ${steps.change > 0 ? "rose" : "fell"} by about ${kcal(Math.abs(steps.change))} a day on the ${noun} before.`,
      });
    }
    const hr = wearable.find((w) => w.label === "Resting heart rate");
    if (hr?.change != null && hr.change >= 3) {
      watch.push({ id: "hr", icon: HeartPulse, text: `Resting heart rate was ${Math.round(hr.change)} bpm higher than the ${noun} before. Stress, illness or short sleep can all do this.` });
    }
  }

  // A week looks at the four weeks up to it; a month or year at all of its own days.
  const patternDates = period === "week"
    ? Array.from({ length: PATTERN_DAYS }, (_, i) => shiftDateKey(span.to, i - PATTERN_DAYS + 1))
    : dates;
  const patterns = ov.logged ? patternItems(ctxFor(data, profile, patternDates, waterTarget), { relative: false }) : [];

  // The habit with the most room to grow, among those the member actually
  // uses: anything logged in the period (and the weeks before it), or every
  // core habit if new.
  const recent = new Set(patternDates);
  const used = habits.filter((h) =>
    h.custom
      ? h.custom.entries.some((e) => recent.has(e.date) && e.value > 0)
      : data[h.core!].some((e) => recent.has(e.date)),
  );
  const pool = (used.length ? used : habits).filter((h) => h.done < len);
  const pick = pool.length ? pool.reduce((a, b) => (b.done < a.done ? b : a)) : null;
  let focus: Focus | null = null;
  if (pick && ov.logged > 0) {
    // Two more days a week than now, between four and seven.
    const perWeek = Math.min(7, Math.max(4, Math.round((pick.done / len) * 7) + 2));
    const when = period === "week" ? `${perWeek} days` : `${perWeek} days a week`;
    focus = {
      label: pick.label,
      text: pick.core ? FOCUS_TIPS[pick.core](when, waterTarget) : `Hit ${pick.custom!.target} ${pick.custom!.unit} on ${when}.`,
    };
  } else if (!pick && ov.logged > 0) {
    focus = { label: "Keep it up", text: `Every habit was done every day. Keep the same rhythm ${REPORT_NEXT[period]}.` };
  }

  return {
    period,
    span,
    days: len,
    label: spanLabel(period, span),
    logged: ov.logged,
    perfect: ov.perfect,
    rate: ov.rate,
    prevRate,
    headline: headlineFor(ov.rate, ov.logged, noun),
    summary,
    highlights: highlights.slice(0, 4),
    watch: watch.slice(0, 3),
    habits,
    wearable,
    patterns,
    focus,
  };
}

/** The weekly report, `weeksAgo` weeks back. */
export const buildWeeklyReport = (data: HabitData, biometrics: BiometricData, profile: ProfileRow | undefined, weeksAgo: number) =>
  buildReport("week", data, biometrics, profile, weeksAgo);

import type { BiometricData, HabitData, HabitEntry } from "../types";
import { EXERCISE_TARGET_MIN } from "./completion";
import { shiftDateKey } from "./dates";

// Insight cards on the Habits page: patterns across days and tips, as opposed
// to the commentary bubble on each card, which is about today only (see
// components/habitComments.ts). Every rule is a pure function of data the
// page already has; pickInsights keeps the best two, so the page stays calm.

export type InsightSection = "nutrition" | "movement";

export interface Insight {
  /** Stable, so a dismissal sticks: "nutrition.weekday-dip". */
  id: string;
  section: InsightSection;
  kind: "pattern" | "streak" | "tip" | "nudge";
  /** 0–100; the two highest are shown. */
  priority: number;
  /** States the finding, under ~60 characters. */
  headline: string;
  /** Why it matters or one thing to try, under ~140 characters. */
  body: string;
  cta?: { label: string; cardId: string };
  /** What it's based on, e.g. "Your last 4 weeks". */
  evidence?: string;
}

export interface InsightContext {
  data: HabitData;
  biometrics: BiometricData;
  today: string;
  /** Local hour, 0–23. */
  hour: number;
  calorieTarget: number;
}

type Rule = (ctx: InsightContext) => Insight | null;

/** Insights shown at once, across the whole page. */
export const MAX_INSIGHTS = 2;
/** Days of history a pattern needs before Fikko trusts it. */
const MIN_PATTERN_DAYS = 14;

const valueOn = (entries: HabitEntry[], date: string) => entries.find((e) => e.date === date)?.value ?? 0;
const lastDays = (today: string, n: number) => Array.from({ length: n }, (_, i) => shiftDateKey(today, -i - 1));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const WEEKDAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
const n = (v: number) => Math.round(v).toLocaleString();

// ── Nutrition ──────────────────────────────────────────────────────────────

/** One weekday that runs well under the calorie target, week after week. */
const weekdayDip: Rule = ({ data, today, calorieTarget }) => {
  const logged = lastDays(today, 28).filter((d) => valueOn(data.food, d) > 0);
  if (logged.length < MIN_PATTERN_DAYS) return null;
  const byDay = new Map<number, number[]>();
  for (const d of logged) {
    const wd = new Date(d + "T00:00:00").getDay();
    byDay.set(wd, [...(byDay.get(wd) ?? []), valueOn(data.food, d)]);
  }
  let worst: { wd: number; gap: number } | null = null;
  for (const [wd, vals] of byDay) {
    if (vals.length < 3) continue;
    const gap = calorieTarget - avg(vals);
    if (gap >= 400 && (!worst || gap > worst.gap)) worst = { wd, gap };
  }
  if (!worst) return null;
  return {
    id: "nutrition.weekday-dip", section: "nutrition", kind: "pattern", priority: 80,
    headline: `${WEEKDAYS[worst.wd]} are your lightest days`,
    body: `You've averaged ${n(worst.gap)} kcal under target on ${WEEKDAYS[worst.wd]}. A planned breakfast can even it out.`,
    cta: { label: "Log a meal", cardId: "habit-food" },
    evidence: "Your last 4 weeks",
  };
};

/** Afternoon with most of the day's food still unlogged. */
const lateLogging: Rule = ({ data, today, hour, calorieTarget }) => {
  if (hour < 14 || hour >= 21) return null;
  const kcal = valueOn(data.food, today);
  if (kcal >= calorieTarget * 0.4) return null;
  // Only for people who usually do log, so it's a nudge, not a nag.
  const usual = lastDays(today, 7).filter((d) => valueOn(data.food, d) > 0).length;
  if (usual < 4) return null;
  return {
    id: "nutrition.late-logging", section: "nutrition", kind: "nudge", priority: 55,
    headline: "Catching up on today's meals?",
    body: "\"Same as yesterday\" and Recent foods log a familiar meal in one tap.",
    cta: { label: "Open Calories", cardId: "habit-food" },
  };
};

/** First week: show off the quickest way to log. */
const scanTip: Rule = ({ data, today }) => {
  const daysLogged = data.food.filter((e) => e.value > 0 && e.date <= today).length;
  if (daysLogged >= 7) return null;
  return {
    id: "nutrition.scan-tip", section: "nutrition", kind: "tip", priority: 40,
    headline: "Packaged food? Scan it",
    body: "Point your camera at the barcode and the calories fill themselves in.",
    cta: { label: "Log a meal", cardId: "habit-food" },
  };
};

// ── Movement ───────────────────────────────────────────────────────────────

/** Active days followed by better-rated sleep. */
const activeSleep: Rule = ({ data, today }) => {
  const days = lastDays(today, 42).filter((d) => valueOn(data.sleep, d) > 0);
  if (days.length < MIN_PATTERN_DAYS) return null;
  const active = days.filter((d) => valueOn(data.exercise, d) >= EXERCISE_TARGET_MIN).map((d) => valueOn(data.sleep, d));
  const quiet = days.filter((d) => valueOn(data.exercise, d) < EXERCISE_TARGET_MIN).map((d) => valueOn(data.sleep, d));
  if (active.length < 5 || quiet.length < 5) return null;
  const diff = avg(active) - avg(quiet);
  if (diff < 0.5) return null;
  return {
    id: "movement.active-sleep", section: "movement", kind: "pattern", priority: 85,
    headline: "You sleep better on active days",
    body: `On days with ${EXERCISE_TARGET_MIN}+ active minutes, you rated your rest ${diff.toFixed(1)} higher on average.`,
    cta: { label: "Log activity", cardId: "habit-exercise" },
    evidence: `${days.length} nights of your data`,
  };
};

/** A movement streak worth marking: 7, 14, 30, 60 or 100 days. */
const movementStreak: Rule = ({ data, today }) => {
  let streak = 0;
  let day = valueOn(data.exercise, today) >= EXERCISE_TARGET_MIN ? today : shiftDateKey(today, -1);
  while (valueOn(data.exercise, day) >= EXERCISE_TARGET_MIN) { streak++; day = shiftDateKey(day, -1); }
  if (![7, 14, 30, 60, 100].includes(streak)) return null;
  return {
    id: `movement.streak-${streak}`, section: "movement", kind: "streak", priority: 90,
    headline: `${streak} days of movement in a row`,
    body: "That's a real habit forming. Keep tomorrow easy if you need to, as long as you move.",
  };
};

/** Steps from the wearable that aren't in the activity log yet. */
const unloggedSteps: Rule = ({ data, biometrics, today }) => {
  const steps = biometrics.steps?.find((e) => e.date === today)?.value ?? 0;
  if (steps < 6000 || valueOn(data.exercise, today) > 0) return null;
  // Roughly 100 steps a minute at a brisk walk.
  const minutes = Math.round(steps / 100 / 5) * 5;
  return {
    id: "movement.unlogged-steps", section: "movement", kind: "nudge", priority: 70,
    headline: `Your wearable counted ${n(steps)} steps`,
    body: `That's about ${minutes} minutes of walking that isn't in your activity log yet.`,
    cta: { label: "Log activity", cardId: "habit-exercise" },
  };
};

const RULES: Rule[] = [weekdayDip, lateLogging, scanTip, activeSleep, movementStreak, unloggedSteps];

/** The insights to show: dismissed ones left out, highest priority first, at most MAX_INSIGHTS. */
export function pickInsights(ctx: InsightContext, dismissed: Set<string>): Insight[] {
  return RULES.map((r) => r(ctx))
    .filter((i): i is Insight => !!i && !dismissed.has(i.id))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, MAX_INSIGHTS);
}

/** Example cards for reviewing the design: open the app with ?insights=demo. */
export const DEMO_INSIGHTS: Insight[] = [
  {
    id: "demo.nutrition", section: "nutrition", kind: "pattern", priority: 80,
    headline: "Mondays are your lightest days",
    body: "You've averaged 610 kcal under target on Mondays. A planned breakfast can even it out.",
    cta: { label: "Log a meal", cardId: "habit-food" }, evidence: "Your last 4 weeks",
  },
  {
    id: "demo.movement", section: "movement", kind: "pattern", priority: 85,
    headline: "You sleep better on active days",
    body: "On days with 30+ active minutes, you rated your rest 0.8 higher on average.",
    cta: { label: "Log activity", cardId: "habit-exercise" }, evidence: "21 nights of your data",
  },
];

import { activityMultiplier, ageFromDob, bmrFor, calorieFloor, goalByKey } from "./metabolics";
import { shiftDateKey } from "./dates";

// Adaptive calorie targets (Premium). Once a week Fikko compares what the
// member ate with how their weight trend moved, works out what they actually
// burn, and may suggest a new calorie target. Pure functions only: the app
// gathers the data and asks the member (components/AdaptiveCheck.tsx).
//
// Measured burn = average kcal eaten (fully logged days) − energy stored
// energy stored = trend weight slope (kg/day) × 7,700 kcal/kg
//
// Activity isn't added separately: a 3–4 week weight trend already includes
// the member's usual activity, and adding wearable calories would count it twice.

/** Daily smoothing for the weight trend (an exponential moving average). */
export const ALPHA = 0.1;
/** Energy in a kilogram of body weight, roughly. */
export const KCAL_PER_KG = 7700;
/** A reading this far from the trend counts half and is flagged. */
const OUTLIER_SHARE = 0.03;
/** No suggestion before this many days of weigh-ins: the first week of a new target is mostly water. */
export const FIRST_CHECK_DAYS = 21;
/** The window grows to this once there's enough history (a full menstrual cycle). */
const FULL_WINDOW_DAYS = 28;
export const MIN_WEIGH_INS = 4;
const MIN_WEIGH_IN_SPAN = 10;
export const MIN_FULL_DAYS = 10;
/** A day counts as fully logged at half the target, or when the member says so. */
const FULL_DAY_SHARE = 0.5;
const MAX_DEFICIT = 0.25;
const MAX_SURPLUS = 0.15;
const MAX_STEP_KCAL = 150;
const MAX_STEP_SHARE = 0.1;
/** Changes smaller than this aren't worth asking about. */
export const MIN_CHANGE_KCAL = 50;
/** With auto-apply on, changes of this size or less are made without asking. */
export const AUTO_APPLY_MAX_KCAL = 100;
/** Losing more than this share of body weight a week, two weeks running, means eat more. */
const FAST_LOSS_SHARE = 0.01;
/** Days between weekly checks, and between asks about auto-apply. */
export const CHECK_EVERY_DAYS = 7;
export const ASK_AUTO_EVERY_DAYS = 30;

export interface WeighIn { date: string; kg: number }
export interface TrendPoint { date: string; kg: number; trend: number; outlier: boolean }

const dayNumber = (date: string) => Date.parse(date + "T00:00:00Z") / 86_400_000;
export const daysBetween = (from: string, to: string) => Math.round(dayNumber(to) - dayNumber(from));

/**
 * The smoothed weight after each weigh-in. Gaps are allowed: after Δt days the
 * trend moves as far as Δt daily weigh-ins would have moved it.
 */
export function trendWeights(weighIns: WeighIn[]): TrendPoint[] {
  const sorted = [...weighIns].filter((w) => w.kg > 0).sort((a, b) => a.date.localeCompare(b.date));
  const out: TrendPoint[] = [];
  for (const w of sorted) {
    const prev = out[out.length - 1];
    if (!prev) { out.push({ ...w, trend: w.kg, outlier: false }); continue; }
    const dt = Math.max(1, daysBetween(prev.date, w.date));
    let k = 1 - (1 - ALPHA) ** dt;
    const outlier = Math.abs(w.kg - prev.trend) / prev.trend > OUTLIER_SHARE;
    if (outlier) k /= 2;
    out.push({ ...w, trend: prev.trend + k * (w.kg - prev.trend), outlier });
  }
  return out;
}

/** The trend on a date: the last trend value at or before it. */
function trendOn(points: TrendPoint[], date: string): number | null {
  let value: number | null = null;
  for (const p of points) { if (p.date > date) break; value = p.trend; }
  return value;
}

/** Least-squares slope of the trend, in kg a day. */
function slopePerDay(points: TrendPoint[]): number {
  const xs = points.map((p) => dayNumber(p.date));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = points.reduce((a, p) => a + p.trend, 0) / points.length;
  let num = 0, den = 0;
  points.forEach((p, i) => { num += (xs[i] - mx) * (p.trend - my); den += (xs[i] - mx) ** 2; });
  return den ? num / den : 0;
}

export interface AdaptiveProfile {
  sex: string | null;
  dob: string | null;
  heightCm: number | null;
  activityLevel: string | null;
  goalKey: string | null;
  /** Signed kg a week: negative to lose. */
  weeklyRateKg: number | null;
  targetWeightKg: number | null;
  /** The onboarding estimate (profiles.tdee), the starting point before any check. */
  startTdee: number | null;
}

export interface AdaptiveInput {
  today: string;
  weighIns: WeighIn[];
  /** Calories eaten per day (habit data's food totals). */
  dailyKcal: { date: string; value: number }[];
  /** Days the member marked as fully logged. */
  completeDays: Set<string>;
  currentTarget: number;
  /** Fikko's running estimate from the last check, if any. */
  previousTdee: number | null;
  profile: AdaptiveProfile;
}

export type CapReason = "deficit" | "surplus" | "floor" | "weekly" | "fast-loss";

export interface Evidence {
  windowDays: number;
  trendStart: number;
  trendEnd: number;
  /** kg a week, from the trend (negative = losing). */
  paceKgWeek: number;
  /** The pace the member chose, kg a week. */
  planKgWeek: number;
  avgEaten: number;
  fullDays: number;
  weighIns: number;
  measuredTdee: number;
  previousTdee: number;
  tdee: number;
  bmr: number;
  floorKcal: number;
  capped: CapReason[];
  /** Under 18: Fikko never suggests a deficit. */
  young: boolean;
}

export type AdaptiveResult =
  /** Not enough to go on yet; what's missing. */
  | { kind: "need-data"; daysLeft: number; weighInsNeeded: number; fullDaysNeeded: number }
  /** Date of birth or height missing, so the safe floor can't be worked out. */
  | { kind: "need-profile" }
  /** The numbers don't add up (probably unlogged meals). */
  | { kind: "check-data"; measuredTdee: number }
  /** The target is about right: no change worth suggesting. */
  | { kind: "steady"; tdee: number; evidence: Evidence }
  | { kind: "suggest"; reason: "lower" | "raise" | "goal-reached"; previous: number; proposed: number; tdee: number; evidence: Evidence };

const round10 = (n: number) => Math.round(n / 10) * 10;

/** The weekly check: Fikko's estimate of what the member burns, and the target it suggests. */
export function adaptiveCheck(input: AdaptiveInput): AdaptiveResult {
  const { today, profile, currentTarget } = input;
  const points = trendWeights(input.weighIns.filter((w) => w.date <= today));
  const history = points.length ? daysBetween(points[0].date, today) : 0;

  const windowDays = history >= FULL_WINDOW_DAYS ? FULL_WINDOW_DAYS : FIRST_CHECK_DAYS;
  const start = shiftDateKey(today, -windowDays);
  const inWindow = points.filter((p) => p.date >= start);
  const span = inWindow.length ? daysBetween(inWindow[0].date, inWindow[inWindow.length - 1].date) : 0;

  // Today is still going, so it's left out of the calories.
  const kcalOn = new Map(input.dailyKcal.map((e) => [e.date, e.value]));
  const fullDays: number[] = [];
  for (let i = 1; i <= windowDays; i++) {
    const date = shiftDateKey(today, -i);
    const kcal = kcalOn.get(date) ?? 0;
    const full = input.completeDays.has(date) ? kcal > 0 : kcal >= currentTarget * FULL_DAY_SHARE;
    if (full) fullDays.push(kcal);
  }

  // Weigh-ins need to be spread out too: four in one week say little about a trend.
  const weighInsNeeded = Math.max(MIN_WEIGH_INS - inWindow.length, span < MIN_WEIGH_IN_SPAN ? 1 : 0, 0);
  if (history < FIRST_CHECK_DAYS || weighInsNeeded > 0 || fullDays.length < MIN_FULL_DAYS) {
    return {
      kind: "need-data",
      daysLeft: Math.max(0, FIRST_CHECK_DAYS - history),
      weighInsNeeded,
      fullDaysNeeded: Math.max(0, MIN_FULL_DAYS - fullDays.length),
    };
  }

  if (!profile.dob || !profile.heightCm) return { kind: "need-profile" };
  const age = ageFromDob(profile.dob);
  const trendEnd = inWindow[inWindow.length - 1].trend;
  const bmr = bmrFor(profile.sex, trendEnd, profile.heightCm, age);
  const formulaTdee = bmr * activityMultiplier(profile.activityLevel);

  const avgEaten = fullDays.reduce((a, b) => a + b, 0) / fullDays.length;
  const slope = slopePerDay(inWindow);
  const measured = avgEaten - slope * KCAL_PER_KG;
  if (measured < 1000 || measured > 5000 || Math.abs(measured - formulaTdee) / formulaTdee > 0.35) {
    return { kind: "check-data", measuredTdee: Math.round(measured) };
  }

  // Blend with the last estimate, trusting new data more when logging is thorough.
  const previousTdee = input.previousTdee ?? profile.startTdee ?? formulaTdee;
  const q = 0.5 * Math.min(1, fullDays.length / (0.8 * windowDays)) * Math.min(1, inWindow.length / (windowDays / 3));
  const tdee = (1 - q) * previousTdee + q * measured;

  // The goal's pace, adjusted for safety.
  const goal = goalByKey(profile.goalKey);
  const plan = goal?.weightManaging && profile.weeklyRateKg ? profile.weeklyRateKg : 0;
  const young = age < 18;
  let rate = young ? Math.max(0, plan) : plan;
  const target = profile.targetWeightKg;
  const reached = target != null && plan !== 0 && (plan < 0 ? trendEnd <= target : trendEnd >= target);
  if (reached) rate = 0;

  const capped: CapReason[] = [];
  let proposed = tdee + (rate * KCAL_PER_KG) / 7;
  if (proposed < tdee * (1 - MAX_DEFICIT)) { proposed = tdee * (1 - MAX_DEFICIT); capped.push("deficit"); }
  if (proposed > tdee * (1 + MAX_SURPLUS)) { proposed = tdee * (1 + MAX_SURPLUS); capped.push("surplus"); }

  // Losing more than 1% of body weight a week, two weeks running: only ever suggest more.
  const t0 = trendOn(points, today), t7 = trendOn(points, shiftDateKey(today, -7)), t14 = trendOn(points, shiftDateKey(today, -14));
  const fastLoss = t0 != null && t7 != null && t14 != null
    && t0 - t7 < -FAST_LOSS_SHARE * trendEnd && t7 - t14 < -FAST_LOSS_SHARE * trendEnd;
  if (fastLoss && proposed < currentTarget + AUTO_APPLY_MAX_KCAL) { proposed = currentTarget + AUTO_APPLY_MAX_KCAL; capped.push("fast-loss"); }

  // Small steps: at most 150 kcal (or 10%) a week.
  // Rounded to 10 kcal, never past the step.
  const step = Math.floor(Math.min(MAX_STEP_KCAL, currentTarget * MAX_STEP_SHARE) / 10) * 10;
  if (Math.abs(proposed - currentTarget) > step) { proposed = currentTarget + Math.sign(proposed - currentTarget) * step; capped.push("weekly"); }
  else proposed = round10(proposed);

  // Never below the member's estimated resting burn (BMR), nor the usual adult floor.
  // This one can move faster than the weekly step: getting back to a safe level shouldn't wait.
  const floorKcal = Math.max(calorieFloor(profile.sex), bmr);
  if (proposed < floorKcal) { proposed = Math.ceil(floorKcal / 10) * 10; capped.push("floor"); }
  const evidence: Evidence = {
    windowDays,
    trendStart: inWindow[0].trend,
    trendEnd,
    paceKgWeek: slope * 7,
    planKgWeek: plan,
    avgEaten: Math.round(avgEaten),
    fullDays: fullDays.length,
    weighIns: inWindow.length,
    measuredTdee: Math.round(measured),
    previousTdee: Math.round(previousTdee),
    tdee: Math.round(tdee),
    bmr: Math.round(bmr),
    floorKcal: Math.round(floorKcal),
    capped,
    young,
  };

  const change = proposed - currentTarget;
  if (Math.abs(change) < MIN_CHANGE_KCAL) return { kind: "steady", tdee: Math.round(tdee), evidence };
  return {
    kind: "suggest",
    reason: reached ? "goal-reached" : change < 0 ? "lower" : "raise",
    previous: currentTarget,
    proposed,
    tdee: Math.round(tdee),
    evidence,
  };
}

/** Whether the weekly check is due (enabled, not paused, a week since the last). */
export function checkDue(s: { enabled: boolean; paused_until: string | null; last_checked_on: string | null }, today: string) {
  if (!s.enabled) return false;
  if (s.paused_until && s.paused_until > today) return false;
  return !s.last_checked_on || daysBetween(s.last_checked_on, today) >= CHECK_EVERY_DAYS;
}

/** Whether to ask about applying small changes automatically (at most once a month, while it's off). */
export function askAutoDue(s: { auto_apply_small: boolean; auto_apply_asked_at: string | null }, now = new Date()) {
  if (s.auto_apply_small) return false;
  return !s.auto_apply_asked_at || now.getTime() - Date.parse(s.auto_apply_asked_at) >= ASK_AUTO_EVERY_DAYS * 86_400_000;
}

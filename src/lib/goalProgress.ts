import type { BiometricData, HabitData } from "@/types";
import type { ProfileRow } from "@/hooks/useProfile";
import type { SleepNote } from "@/components/HabitsView";
import { kgToLb } from "./metabolics";
import { avgOf, parseJSON, sleepHours, valuesIn } from "./dashboardStats";
import { todayKey } from "./dates";

/** How a target is going: on track, close to it, or not there yet. */
export type GoalStatus = "on" | "close" | "off";

export interface GoalLine {
  key: "weight" | "calories" | "water" | "sleep";
  label: string;
  /** What the member is doing now, e.g. "1,820 kcal a day". */
  now: string;
  /** What they set out to do, e.g. "target 1,900". */
  target: string;
  status: GoalStatus;
  /** How close they are to the target, 0 to 1, for a progress bar. */
  progress: number;
  /** One plain sentence about where this is heading. */
  note: string;
}

/** Fewer logged days than this and a line isn't shown: too little to judge. */
const MIN_DAYS = 3;
/** Energy in a kilogram of body weight, roughly. */
const KCAL_PER_KG = 7700;

const kcal = (v: number) => Math.round(v).toLocaleString();
const one = (v: number) => (Math.round(v * 10) / 10).toLocaleString();

/**
 * Whether the member is heading for the targets they set in onboarding:
 * their weight goal and pace, and their daily calories, water and sleep.
 * Each line only appears once there's enough logged in `dates` to say.
 */
export function goalProgress(
  data: HabitData, biometrics: BiometricData, profile: ProfileRow | undefined, period: string[],
): GoalLine[] {
  if (!profile) return [];
  // Today is still going, so a half-logged day doesn't count against a target.
  const today = todayKey();
  const dates = period.filter((d) => d !== today);
  const lines: GoalLine[] = [];
  const lb = profile.weight_unit === "lb";
  const w = (kg: number) => `${one(lb ? kgToLb(kg) : kg)} ${lb ? "lb" : "kg"}`;

  const food = valuesIn(data.food, dates, (e) => e.value > 0);
  const avgKcal = avgOf(food);

  // ── Weight ──
  const rate = profile.weekly_rate_kg;
  const target = profile.target_weight_kg;
  if (target != null && rate) {
    // Real weigh-ins beat an estimate: use the wearable's scale readings when
    // there are a couple of weeks of them, otherwise work it out from calories.
    const weighIns = biometrics.weight.filter((e) => e.value > 0).slice(-60);
    const first = weighIns[0];
    const last = weighIns[weighIns.length - 1];
    const spanDays = first && last ? (Date.parse(last.date) - Date.parse(first.date)) / 86_400_000 : 0;
    let pace: number | null = null;
    let source = "";
    if (spanDays >= 10) {
      pace = ((last.value - first.value) / spanDays) * 7;
      source = "from your weigh-ins";
    } else if (avgKcal != null && food.length >= MIN_DAYS && profile.tdee) {
      pace = ((avgKcal - profile.tdee) * 7) / KCAL_PER_KG;
      source = "from the calories you've logged";
    }
    if (pace != null) {
      const current = last?.value ?? profile.weight_kg;
      const ratio = pace / rate; // 1 = exactly the planned pace, negative = the wrong way
      const status: GoalStatus = ratio >= 0.75 ? "on" : ratio >= 0.3 ? "close" : "off";
      const loss = rate < 0;
      const toGo = current != null ? Math.abs(target - current) : null;
      // Time to go at the pace they're actually keeping, not the one planned.
      const weeks = toGo != null && pace !== 0 ? Math.ceil(toGo / Math.abs(pace)) : null;
      const reached = current != null && (loss ? current <= target : current >= target);

      let note: string;
      if (reached) note = `You've reached ${w(target)}. Time to set a new goal or hold steady.`;
      else if (ratio > 1.5) note = `Faster than the ${w(Math.abs(rate))} a week you planned. A steadier pace is easier to keep.`;
      else if (status === "on") note = `On pace for about ${w(Math.abs(pace))} a week, ${source}.${weeks ? ` About ${weeks} ${weeks === 1 ? "week" : "weeks"} to ${w(target)} at this rate.` : ""}`;
      else if (status === "close") note = `Heading the right way at about ${w(Math.abs(pace))} a week, slower than the ${w(Math.abs(rate))} you planned (${source}).`;
      else note = `Not moving towards ${w(target)} yet, ${source}. Your ${kcal(profile.calorie_goal)} kcal target is set to get you there.`;

      lines.push({
        key: "weight",
        label: loss ? "Weight loss" : "Weight gain",
        now: current != null ? `${w(current)} now` : `${w(Math.abs(pace))} a week`,
        target: `goal ${w(target)}`,
        status: reached ? "on" : status,
        progress: reached ? 1 : Math.max(0, Math.min(1, ratio)),
        note,
      });
    }
  }

  // ── Calories ──
  const goal = profile.calorie_goal;
  if (avgKcal != null && food.length >= MIN_DAYS && goal) {
    const gap = avgKcal - goal;
    const share = Math.abs(gap) / goal;
    const onDays = food.filter((v) => Math.abs(v - goal) <= goal * 0.1).length;
    lines.push({
      key: "calories",
      label: "Calories",
      now: `${kcal(avgKcal)} kcal a day`,
      target: `target ${kcal(goal)}`,
      status: share <= 0.1 ? "on" : share <= 0.2 ? "close" : "off",
      progress: Math.min(avgKcal, goal) / Math.max(avgKcal, goal),
      note: share <= 0.1
        ? `Within your target on ${onDays} of ${food.length} days logged.`
        : `About ${kcal(Math.abs(gap))} kcal ${gap > 0 ? "over" : "under"} your target on an average day.`,
    });
  }

  // ── Water ──
  const water = valuesIn(data.water, dates, (e) => e.value > 0);
  const avgWater = avgOf(water);
  if (avgWater != null && water.length >= MIN_DAYS && profile.water_goal) {
    const hit = water.filter((v) => v >= profile.water_goal).length;
    const share = avgWater / profile.water_goal;
    lines.push({
      key: "water",
      label: "Water",
      now: `${one(avgWater)} glasses a day`,
      target: `target ${profile.water_goal}`,
      status: share >= 0.95 ? "on" : share >= 0.75 ? "close" : "off",
      progress: Math.min(1, share),
      note: share >= 0.95
        ? `Target reached on ${hit} of ${water.length} days.`
        : `About ${one(profile.water_goal - avgWater)} ${profile.water_goal - avgWater >= 1.5 ? "glasses" : "glass"} short on an average day.`,
    });
  }

  // ── Sleep ──
  const hours = dates
    .map((d) => {
      const note = parseJSON<SleepNote>(data.sleep.find((e) => e.date === d)?.note);
      return sleepHours(note?.bedtime, note?.wake);
    })
    .filter((h): h is number => h != null);
  const avgHours = avgOf(hours);
  if (avgHours != null && hours.length >= MIN_DAYS && profile.sleep_goal) {
    const short = profile.sleep_goal - avgHours;
    lines.push({
      key: "sleep",
      label: "Sleep",
      now: `${one(avgHours)}h a night`,
      target: `target ${profile.sleep_goal}h`,
      status: short <= 0.25 ? "on" : short <= 0.75 ? "close" : "off",
      progress: Math.min(1, avgHours / profile.sleep_goal),
      note: short <= 0.25
        ? `Getting the sleep you aimed for on most nights.`
        : `About ${one(short)}h short of your target on an average night.`,
    });
  }

  return lines;
}

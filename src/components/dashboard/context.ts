import { Activity, Droplet, Moon, Pill, SmilePlus, Utensils, type LucideIcon } from "lucide-react";
import type { HabitData, HabitEntry } from "../../types";
import type { ProfileRow } from "../../hooks/useProfile";
import type { HabitHue } from "../HabitCard";
import { EXERCISE_TARGET_MIN, type CoreHabit } from "../../lib/completion";
import type { HabitStat, Overview, Period } from "../../lib/dashboardStats";
import { MOODS, REST_SCALE } from "../HabitsView";

/** Everything the dashboard sections read, worked out once per period. */
export interface DashCtx {
  data: HabitData;
  profile?: ProfileRow;
  period: Period;
  dates: string[];
  prevDates: string[];
  ov: Overview;
  /** The period before, or null when nothing was logged in it. */
  prevOv: Overview | null;
  stats: HabitStat[];
  /** The member's daily water goal, in glasses. */
  waterTarget: number;
  /** Each built-in habit's entries by date. */
  m: Record<CoreHabit, Map<string, HabitEntry>>;
}

export const HABIT_INFO: Record<CoreHabit, { label: string; icon: LucideIcon; hue: HabitHue; target: string }> = {
  food:       { label: "Calories",    icon: Utensils,  hue: "food",     target: "Any food logged" },
  exercise:   { label: "Activity",    icon: Activity,  hue: "exercise", target: `${EXERCISE_TARGET_MIN}+ minutes` },
  // The scorecard fills in the member's own water goal.
  water:      { label: "Water",       icon: Droplet,   hue: "water",    target: "Daily water goal" },
  mood:       { label: "Mood",        icon: SmilePlus, hue: "mood",     target: "Checked in" },
  medication: { label: "Medications", icon: Pill,      hue: "meds",     target: "Everything taken" },
  sleep:      { label: "Sleep",       icon: Moon,      hue: "sleep",    target: "Rested “Okay” or better" },
};

export function habitLabel(s: HabitStat): string {
  return s.custom ? s.custom.name : HABIT_INFO[s.key as CoreHabit].label;
}

/** A day's value, or null when nothing was logged. */
export function val(map: Map<string, HabitEntry>, date: string): number | null {
  return map.get(date)?.value ?? null;
}

export const PERIOD_PHRASE: Record<Period, string> = {
  week: "the last 7 days",
  month: "the last 30 days",
  year: "the last 12 months",
};

export const PREV_PHRASE: Record<Period, string> = {
  week: "the 7 days before",
  month: "the 30 days before",
  year: "the year before",
};

export const restLabel = (v: number) => REST_SCALE[Math.round(v) - 1]?.label ?? "—";
export const moodLabel = (v: number) => MOODS[Math.round(v) - 1]?.label ?? "—";

export const kcal = (v: number) => Math.round(v).toLocaleString();
export const one = (v: number) => (Math.round(v * 10) / 10).toLocaleString();
export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

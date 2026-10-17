import type { BiometricData, HabitData } from "../types";
import { workoutKcal } from "./activities";
import { workoutsOf } from "./workouts";
import { shiftDateKey } from "./dates";

// Training-day targets (Max, opt-in). The calorie target rises on days with a
// logged workout and dips a little on rest days, so the week still adds up to
// the usual target:
//
//   today's target = base + ½ × (today's workout kcal − average daily workout kcal)
//
// Only half a workout's calories are given back, because workout estimates
// (formulas and wearables alike) usually run high. Usual activity is already
// part of the base target, which is why the average is taken off. With this on,
// the Calories card compares what was eaten with the day's target instead of
// subtracting burned calories, so nothing is counted twice.

export const SHARE = 0.5;
export const MAX_SHIFT_KCAL = 300;
const AVERAGE_DAYS = 28;

export interface TrainingDay {
  /** The member's usual daily target. */
  base: number;
  /** Today's change, already capped: positive on workout days, negative on rest days. */
  adjust: number;
  /** Calories the day's logged workouts burned. */
  workoutKcal: number;
  /** Average logged workout calories a day over the last four weeks. */
  averageKcal: number;
}

const entryOn = (data: HabitData, date: string) => data.exercise.find((e) => e.date === date);

/** Calories burned by the workouts logged on a day (entered, or estimated). */
export function loggedWorkoutKcal(data: HabitData, date: string, weightKg?: number | null) {
  return workoutsOf(entryOn(data, date)).reduce((sum, w) => sum + workoutKcal(w, weightKg).kcal, 0);
}

function loggedWorkoutMinutes(data: HabitData, date: string) {
  return workoutsOf(entryOn(data, date)).reduce((sum, w) => sum + w.minutes, 0);
}

/** The day's target with training days on. */
export function trainingDay(data: HabitData, date: string, base: number, weightKg?: number | null): TrainingDay {
  let total = 0;
  for (let i = 1; i <= AVERAGE_DAYS; i++) total += loggedWorkoutKcal(data, shiftDateKey(date, -i), weightKg);
  const averageKcal = total / AVERAGE_DAYS;
  const kcal = loggedWorkoutKcal(data, date, weightKg);
  const raw = SHARE * (kcal - averageKcal);
  const adjust = Math.round(Math.max(-MAX_SHIFT_KCAL, Math.min(MAX_SHIFT_KCAL, raw)) / 5) * 5;
  return { base, adjust, workoutKcal: Math.round(kcal), averageKcal: Math.round(averageKcal) };
}

export type WorkoutMismatch =
  /** The wearable saw much more activity than was logged: a workout may be missing. */
  | { date: string; kind: "under"; deviceMinutes: number; loggedMinutes: number }
  /** The log claims far more than the wearable counted: worth a second look. */
  | { date: string; kind: "over"; deviceKcal: number; loggedKcal: number };

/** Gaps this large between the log and the wearable are worth asking about. */
const UNDER_MINUTES = 45;
const OVER_KCAL = 250;
const OVER_RATIO = 1.5;

/**
 * Days in the last few where the wearable and the workout log disagree a lot.
 * Wearable data arrives overnight, so this looks back rather than at today.
 * Workouts change the target, so a big gap is worth the member checking.
 */
export function workoutMismatches(data: HabitData, biometrics: BiometricData, today: string, weightKg?: number | null, days = 3): WorkoutMismatch[] {
  const out: WorkoutMismatch[] = [];
  for (let i = 0; i <= days; i++) {
    const date = shiftDateKey(today, -i);
    const deviceMinutes = biometrics.activeMinutes.find((e) => e.date === date)?.value;
    const deviceKcal = biometrics.activeCalories.find((e) => e.date === date)?.value;
    const loggedKcal = loggedWorkoutKcal(data, date, weightKg);
    const loggedMinutes = loggedWorkoutMinutes(data, date);
    if (deviceKcal != null && loggedKcal > deviceKcal + OVER_KCAL && loggedKcal > deviceKcal * OVER_RATIO) {
      out.push({ date, kind: "over", deviceKcal: Math.round(deviceKcal), loggedKcal: Math.round(loggedKcal) });
    } else if (deviceMinutes != null && deviceMinutes - loggedMinutes >= UNDER_MINUTES) {
      out.push({ date, kind: "under", deviceMinutes: Math.round(deviceMinutes), loggedMinutes });
    }
  }
  return out;
}

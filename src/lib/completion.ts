import type { HabitData } from "../types";

/** The six built-in habits, in the order they appear on the Habits page. */
export type CoreHabit = "food" | "exercise" | "water" | "mood" | "medication" | "sleep";

/** Used when a member hasn't set their own water goal. */
export const WATER_TARGET = 8;
export const EXERCISE_TARGET_MIN = 30;

function valueOn(entries: { date: string; value: number }[], date: string): number {
  return entries.find((e) => e.date === date)?.value ?? 0;
}

/**
 * A day's activity: workouts the member logged plus their wearable's active
 * minutes. Logging is meant for what the device missed, so the two add up.
 */
export function activityMinutes(data: HabitData, date: string) {
  const logged = valueOn(data.exercise, date);
  const device = valueOn(data.deviceExercise ?? [], date);
  return { logged, device, total: logged + device };
}

/**
 * The habits with activity as the day's total, for read-only views such as
 * the Dashboard and reports. Never save this back: `exercise` must stay as
 * just the member's own workouts.
 */
export function withDeviceActivity(data: HabitData): HabitData {
  const device = data.deviceExercise ?? [];
  if (!device.length) return data;
  const dates = new Set([...data.exercise, ...device].map((e) => e.date));
  const exercise = [...dates].map((date) => ({ date, value: activityMinutes(data, date).total }));
  return { ...data, exercise, deviceExercise: [] };
}

/** When a built-in habit counts as done for a day. Water uses the member's own goal from Profile. */
export function coreDone(data: HabitData, key: CoreHabit, date: string, waterTarget = WATER_TARGET): boolean {
  switch (key) {
    case "water": return valueOn(data.water, date) >= waterTarget;
    // The medication entry's value is 1 once every scheduled item is ticked.
    case "medication": return valueOn(data.medication, date) === 1;
    case "food": return valueOn(data.food, date) > 0;
    case "exercise": return activityMinutes(data, date).total >= EXERCISE_TARGET_MIN;
    // Any rest score counts, even "Exhausted": logging how the night went is the habit.
    case "sleep": return valueOn(data.sleep, date) > 0;
    case "mood": return valueOn(data.mood, date) > 0;
  }
}

export const CORE_HABITS: CoreHabit[] = ["food", "exercise", "water", "mood", "medication", "sleep"];

/** The built-in habits that count for this member: Medications only once they've listed some. */
export function activeCoreHabits(data: HabitData): CoreHabit[] {
  return data.tracksMedications === false ? CORE_HABITS.filter((k) => k !== "medication") : CORE_HABITS;
}

/** How many habits, built-in and custom, are done on a day. */
export function completion(data: HabitData, date: string, waterTarget = WATER_TARGET) {
  const core = activeCoreHabits(data).map((key) => ({ key, done: coreDone(data, key, date, waterTarget) }));
  const custom = data.custom.map((h) => ({
    habit: h,
    done: valueOn(h.entries, date) >= h.target,
  }));
  const done = core.filter((c) => c.done).length + custom.filter((c) => c.done).length;
  return { core, custom, done, total: core.length + custom.length };
}

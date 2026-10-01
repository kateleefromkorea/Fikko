import type { HabitData } from "../types";

/** The six built-in habits, in the order they appear on the Habits page. */
export type CoreHabit = "food" | "exercise" | "water" | "mood" | "medication" | "sleep";

/** Used when a member hasn't set their own water goal. */
export const WATER_TARGET = 8;
export const EXERCISE_TARGET_MIN = 30;

function valueOn(entries: { date: string; value: number }[], date: string): number {
  return entries.find((e) => e.date === date)?.value ?? 0;
}

/** When a built-in habit counts as done for a day. Water uses the member's own goal from Profile. */
export function coreDone(data: HabitData, key: CoreHabit, date: string, waterTarget = WATER_TARGET): boolean {
  switch (key) {
    case "water": return valueOn(data.water, date) >= waterTarget;
    // The medication entry's value is 1 once every scheduled item is ticked.
    case "medication": return valueOn(data.medication, date) === 1;
    case "food": return valueOn(data.food, date) > 0;
    case "exercise": return valueOn(data.exercise, date) >= EXERCISE_TARGET_MIN;
    // Rest score of "Okay" or better.
    case "sleep": return valueOn(data.sleep, date) >= 3;
    case "mood": return valueOn(data.mood, date) > 0;
  }
}

export const CORE_HABITS: CoreHabit[] = ["food", "exercise", "water", "mood", "medication", "sleep"];

/** How many habits, built-in and custom, are done on a day. */
export function completion(data: HabitData, date: string, waterTarget = WATER_TARGET) {
  const core = CORE_HABITS.map((key) => ({ key, done: coreDone(data, key, date, waterTarget) }));
  const custom = data.custom.map((h) => ({
    habit: h,
    done: valueOn(h.entries, date) >= h.target,
  }));
  const done = core.filter((c) => c.done).length + custom.filter((c) => c.done).length;
  return { core, custom, done, total: core.length + custom.length };
}

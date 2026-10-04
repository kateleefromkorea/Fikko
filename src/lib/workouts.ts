import type { HabitEntry } from "../types";

// The workouts a member logs themselves ("Yoga, 20 min"). They live in the
// day's exercise entry: the value is their total minutes and the note lists
// them. Wearable minutes are kept apart (HabitData.deviceExercise) and added
// on top, so logging is for what the device missed.

export interface Workout {
  /** Empty for minutes logged before workouts had names. */
  name: string;
  minutes: number;
}

export const MAX_WORKOUTS = 20;
export const WORKOUT_NAME_MAX = 40;
const DAY_MINUTES = 1440;

/** The day's logged workouts. An older entry with minutes but no list reads as one unnamed workout. */
export function workoutsOf(entry?: Pick<HabitEntry, "value" | "note">): Workout[] {
  if (!entry || !(entry.value > 0)) return [];
  let list: unknown = null;
  try { list = entry.note ? (JSON.parse(entry.note) as { workouts?: unknown }).workouts : null; } catch { /* damaged note */ }
  if (Array.isArray(list)) {
    const valid = list
      .filter((w): w is Workout => !!w && typeof w === "object" && Number((w as Workout).minutes) > 0)
      .map((w) => ({ name: typeof w.name === "string" ? w.name.slice(0, WORKOUT_NAME_MAX) : "", minutes: Math.round(Number(w.minutes)) }));
    if (valid.length) return valid;
  }
  return [{ name: "", minutes: entry.value }];
}

/** The exercise entry for a day holding these workouts. */
export function workoutsEntry(date: string, workouts: Workout[]): HabitEntry {
  const list = workouts.slice(-MAX_WORKOUTS);
  const value = Math.min(DAY_MINUTES, list.reduce((sum, w) => sum + w.minutes, 0));
  return { date, value, note: JSON.stringify({ workouts: list }) };
}

/** A tidied workout, or null if there are no minutes to log. */
export function newWorkout(name: string, minutes: number): Workout | null {
  const m = Math.round(minutes);
  if (!(m > 0)) return null;
  return { name: name.trim().replace(/\s+/g, " ").slice(0, WORKOUT_NAME_MAX), minutes: Math.min(DAY_MINUTES, m) };
}

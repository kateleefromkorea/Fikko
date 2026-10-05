import type { HabitEntry } from "../types";
import { typeFromName } from "./activities";

// The workouts a member logs themselves ("Yoga, 20 min, easy"). They live in
// the day's exercise entry: the value is their total minutes and the note
// lists them. Wearable minutes are kept apart (HabitData.deviceExercise) and
// added on top, so logging is for what the device missed.

export type Intensity = "easy" | "moderate" | "hard";

export interface Workout {
  /** Stable within the day, for editing and removing one entry. */
  id: string;
  /** A catalogue type (see lib/activities), or "other" for the member's own. */
  type: string;
  /** The member's own name for it; empty means the type's label. */
  name: string;
  minutes: number;
  intensity?: Intensity;
  /** Calories the member entered (from a watch or machine). Unset means estimate it. */
  kcal?: number;
}

export const MAX_WORKOUTS = 20;
export const WORKOUT_NAME_MAX = 40;
const DAY_MINUTES = 1440;
const MAX_KCAL = 5000;
const INTENSITIES: Intensity[] = ["easy", "moderate", "hard"];

const newId = () => Math.random().toString(36).slice(2, 10);
const tidyName = (name: string) => name.trim().replace(/\s+/g, " ").slice(0, WORKOUT_NAME_MAX);

/**
 * The day's logged workouts. Entries from before the activity catalogue
 * ({ name, minutes } only) get a type from their name; an older entry with
 * minutes but no list reads as one workout of type "other".
 */
export function workoutsOf(entry?: Pick<HabitEntry, "value" | "note">): Workout[] {
  if (!entry || !(entry.value > 0)) return [];
  let list: unknown = null;
  try { list = entry.note ? (JSON.parse(entry.note) as { workouts?: unknown }).workouts : null; } catch { /* damaged note */ }
  if (Array.isArray(list)) {
    const valid = list
      .filter((w): w is Record<string, unknown> => !!w && typeof w === "object" && Number((w as Workout).minutes) > 0)
      .map((w, i): Workout => {
        const name = typeof w.name === "string" ? w.name.slice(0, WORKOUT_NAME_MAX) : "";
        const kcal = Number(w.kcal);
        return {
          id: typeof w.id === "string" ? w.id : `w${i}`,
          type: typeof w.type === "string" ? w.type : typeFromName(name),
          name,
          minutes: Math.round(Number(w.minutes)),
          intensity: INTENSITIES.includes(w.intensity as Intensity) ? (w.intensity as Intensity) : undefined,
          kcal: w.kcal != null && kcal >= 0 ? Math.min(MAX_KCAL, Math.round(kcal)) : undefined,
        };
      });
    if (valid.length) return valid;
  }
  return [{ id: "w0", type: "other", name: "", minutes: entry.value }];
}

/** The exercise entry for a day holding these workouts. */
export function workoutsEntry(date: string, workouts: Workout[]): HabitEntry {
  const list = workouts.slice(-MAX_WORKOUTS);
  const value = Math.min(DAY_MINUTES, list.reduce((sum, w) => sum + w.minutes, 0));
  return { date, value, note: JSON.stringify({ workouts: list }) };
}

/**
 * A tidied workout, or null if there are no minutes to log. A name that
 * matches a catalogue activity ("evening jog") becomes that type.
 */
export function newWorkout(
  name: string,
  minutes: number,
  extra: { type?: string; intensity?: Intensity; kcal?: number | null } = {},
): Workout | null {
  const m = Math.round(minutes);
  if (!(m > 0)) return null;
  const tidy = tidyName(name);
  const type = extra.type ?? typeFromName(tidy);
  const kcal = extra.kcal != null && extra.kcal >= 0 ? Math.min(MAX_KCAL, Math.round(extra.kcal)) : undefined;
  return {
    id: newId(),
    type,
    // A catalogue activity is stored by type; only "other" keeps a name of its own.
    name: type === "other" ? tidy : "",
    minutes: Math.min(DAY_MINUTES, m),
    ...(extra.intensity && extra.intensity !== "moderate" ? { intensity: extra.intensity } : {}),
    ...(kcal != null ? { kcal } : {}),
  };
}

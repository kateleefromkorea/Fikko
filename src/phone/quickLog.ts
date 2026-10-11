import { MOOD_OPTIONS } from "@/components/HabitsView";
import type { HabitData, HabitEntry, MealKey } from "@/types";

/**
 * One-tap logs for the Today rows and the capture sheet. Each returns the next
 * habit data and saves values in exactly the shape the web cards do, so a
 * glass added here is the same glass the Water card shows.
 */

function valueOn(entries: HabitEntry[], date: string) {
  return entries.find((e) => e.date === date)?.value ?? 0;
}

function setDateValue(entries: HabitEntry[], date: string, value: number, note?: string): HabitEntry[] {
  const existing = entries.find((e) => e.date === date);
  if (existing) return entries.map((e) => (e.date === date ? { ...e, value, ...(note !== undefined ? { note } : {}) } : e));
  return [...entries, { date, value, ...(note !== undefined ? { note } : {}) }];
}

/** One more glass of water (the Water card caps a day at 30). */
export function addGlass(data: HabitData, date: string): HabitData {
  return { ...data, water: setDateValue(data.water, date, Math.min(30, valueOn(data.water, date) + 1)) };
}

/** The mood options a row offers in one tap: one per point of the 1–5 scale. */
export const QUICK_MOODS = (["rough", "meh", "okay", "good", "great"] as const).map(
  (key) => MOOD_OPTIONS.find((o) => o.key === key)!,
);

export function setMood(data: HabitData, date: string, key: string): HabitData {
  const option = MOOD_OPTIONS.find((o) => o.key === key);
  if (!option) return data;
  return { ...data, mood: setDateValue(data.mood, date, option.value, option.key) };
}

/** Which medications are ticked on a day (the Medications card keeps them as JSON in the note). */
export function medsTaken(data: HabitData, date: string): Record<string, boolean> {
  const note = data.medication.find((e) => e.date === date)?.note;
  try {
    return note ? (JSON.parse(note) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/** Ticks every listed medication for the day: the habit's "took them all". */
export function takeAllMeds(data: HabitData, date: string, ids: string[]): HabitData {
  if (!ids.length) return data;
  const checked = { ...medsTaken(data, date), ...Object.fromEntries(ids.map((id) => [id, true])) };
  return { ...data, medication: setDateValue(data.medication, date, 1, JSON.stringify(checked)) };
}

/** Adds one to a custom habit's day. */
export function bumpCustom(data: HabitData, date: string, habitId: string): HabitData {
  return {
    ...data,
    custom: data.custom.map((h) => (h.id === habitId ? { ...h, entries: setDateValue(h.entries, date, valueOn(h.entries, date) + 1) } : h)),
  };
}

/** The meal someone is most likely logging right now, from the time of day. */
export function mealForNow(now = new Date()): MealKey {
  const h = now.getHours() + now.getMinutes() / 60;
  if (h < 10.5) return "breakfast";
  if (h < 15) return "lunch";
  if (h >= 17 && h < 21.5) return "dinner";
  return "snacks";
}

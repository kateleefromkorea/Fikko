import { useEffect, useMemo, useRef, useState } from "react";
import type { HabitData, HabitEntry } from "../types";
import { MAX_WORKOUTS, newWorkout, workoutsEntry, workoutsOf, type Intensity, type Workout } from "../lib/workouts";
import { STARTER_TYPES, activityOf, dayBurn, workoutKcal, workoutLabel } from "../lib/activities";

/** Same type (or, for the member's own activities, same name) shares a row. */
export const groupKey = (w: Pick<Workout, "type" | "name">) =>
  w.type === "other" ? `other:${w.name.trim().toLowerCase()}` : w.type;

export interface WorkoutGroup {
  key: string;
  type: string;
  label: string;
  minutes: number;
  kcal: number;
  /** True if any part of the calories is an estimate. */
  estimated: boolean;
  items: Workout[];
}

/** A chip: a catalogue type, or one of the member's own named activities. */
export interface ActivityChoice { type: string; name: string }

export interface WorkoutDraft { type: string; name: string; minutes: number; intensity: Intensity; kcal: number | null }

const CHIP_COUNT = 6;
const HISTORY_FROM_TOP = 3;
const DEFAULT_MINUTES = 30;
const UNDO_MS = 6000;

function upsertDay(entries: HabitEntry[], entry: HabitEntry): HabitEntry[] {
  return entries.some((e) => e.date === entry.date)
    ? entries.map((e) => (e.date === entry.date ? { ...e, value: entry.value, note: entry.note } : e))
    : [...entries, entry];
}

/**
 * The Activity card's state for one day: its workouts (grouped for display),
 * the day's burn, chips ordered by the member's own history, and the actions
 * to log, repeat, edit and remove, with undo.
 */
export function useActivityLog({ data, onChange, date, weightKg, deviceKcal }: {
  data: HabitData;
  onChange: (next: HabitData) => void;
  date: string;
  weightKg?: number | null;
  deviceKcal: number | null;
}) {
  const workouts = useMemo(() => workoutsOf(data.exercise.find((e) => e.date === date)), [data.exercise, date]);

  const groups = useMemo(() => {
    const map = new Map<string, WorkoutGroup>();
    for (const w of workouts) {
      const key = groupKey(w);
      const { kcal, estimated } = workoutKcal(w, weightKg);
      const g = map.get(key) ?? { key, type: w.type, label: workoutLabel(w), minutes: 0, kcal: 0, estimated: false, items: [] };
      g.minutes += w.minutes;
      g.kcal += kcal;
      g.estimated ||= estimated;
      g.items.push(w);
      map.set(key, g);
    }
    return [...map.values()];
  }, [workouts, weightKg]);

  const burn = useMemo(() => dayBurn(workouts, weightKg, deviceKcal), [workouts, weightKg, deviceKcal]);

  // Every workout ever logged, newest day first: for the chips and each activity's usual length.
  const history = useMemo(
    () => [...data.exercise].sort((a, b) => b.date.localeCompare(a.date)).flatMap((e) => workoutsOf(e)),
    [data.exercise],
  );

  const chips = useMemo<ActivityChoice[]>(() => {
    const counts = new Map<string, { choice: ActivityChoice; n: number }>();
    for (const w of history) {
      if (w.type === "other" && !w.name) continue; // unnamed minutes from before activities had types
      const key = groupKey(w);
      const c = counts.get(key) ?? { choice: { type: w.type, name: w.type === "other" ? w.name : "" }, n: 0 };
      c.n += 1;
      counts.set(key, c);
    }
    const favourites = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, HISTORY_FROM_TOP).map((c) => c.choice);
    const seen = new Set(favourites.map(groupKey));
    const starters = STARTER_TYPES.filter((t) => !seen.has(t)).map((type) => ({ type, name: "" }));
    return [...favourites, ...starters].slice(0, CHIP_COUNT);
  }, [history]);

  /** The length and effort last logged for this activity, to start from. */
  const usualFor = (choice: ActivityChoice): Pick<WorkoutDraft, "minutes" | "intensity"> => {
    const last = history.find((w) => groupKey(w) === groupKey(choice));
    return { minutes: last?.minutes ?? DEFAULT_MINUTES, intensity: last?.intensity ?? "moderate" };
  };

  const save = (next: Workout[]) => onChange({ ...data, exercise: upsertDay(data.exercise, workoutsEntry(date, next)) });

  const full = workouts.length >= MAX_WORKOUTS;

  function add(d: WorkoutDraft) {
    const w = newWorkout(d.name, d.minutes, { type: d.type, intensity: d.intensity, kcal: d.kcal });
    if (!w || full) return;
    save([...workouts, w]);
  }

  /** Logs another of this group's most recent entry. */
  function repeat(group: WorkoutGroup) {
    const last = group.items[group.items.length - 1];
    add({ type: last.type, name: last.name, minutes: last.minutes, intensity: last.intensity ?? "moderate", kcal: last.kcal ?? null });
  }

  function update(id: string, d: WorkoutDraft) {
    const w = newWorkout(d.name, d.minutes, { type: d.type, intensity: d.intensity, kcal: d.kcal });
    if (!w) return;
    save(workouts.map((x) => (x.id === id ? { ...w, id } : x)));
  }

  // Undo: the last removal, offered for a few seconds.
  const [removed, setRemoved] = useState<{ items: Workout[]; label: string } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // A removal on one day can't be undone onto another.
  useEffect(() => { setRemoved(null); }, [date]);

  function remove(ids: string[]) {
    const items = workouts.filter((w) => ids.includes(w.id));
    if (!items.length) return;
    save(workouts.filter((w) => !ids.includes(w.id)));
    setRemoved({ items, label: workoutLabel(items[0]) + (items.length > 1 ? ` ×${items.length}` : "") });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setRemoved(null), UNDO_MS);
  }

  function undo() {
    if (!removed) return;
    save([...workouts, ...removed.items].slice(-MAX_WORKOUTS));
    setRemoved(null);
  }

  return { workouts, groups, burn, chips, usualFor, add, repeat, update, remove, undo, removed, full, activityOf };
}

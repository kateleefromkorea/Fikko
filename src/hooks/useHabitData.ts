import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { fetchAllRows } from "../lib/fetchAll";
import type { CustomHabit, HabitData, HabitEntry } from "../types";
import { daysAgoKey } from "../lib/dates";

const EMPTY_DATA: HabitData = {
  water: [],
  medication: [],
  food: [],
  exercise: [],
  sleep: [],
  mood: [],
  custom: [],
};

const SIMPLE_CATEGORIES = ["water", "medication", "food", "exercise", "sleep", "mood"] as const;
type SimpleCategory = (typeof SIMPLE_CATEGORIES)[number];

// How much history the app keeps loaded. The Dashboard's longest view is 12
// months, so ~13 months covers it without downloading a user's entire history
// on every visit (which grows forever). Saving only upserts changed entries,
// so older rows outside this window are never touched. "Export my data"
// fetches the full history separately.
const HISTORY_DAYS = 400;

function historyStart() {
  return daysAgoKey(HISTORY_DAYS);
}

async function fetchHabitData(userId: string): Promise<HabitData> {
  const since = historyStart();
  const [entries, customHabits, customEntries] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase.from("habit_entries").select("category, date, value, note")
        .eq("user_id", userId).gte("date", since)
        .order("date").order("category").range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase.from("custom_habits").select("id, name, unit, target, color, icon")
        .eq("user_id", userId).order("id").range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase.from("custom_habit_entries").select("custom_habit_id, date, value")
        .eq("user_id", userId).gte("date", since)
        .order("date").order("custom_habit_id").range(from, to),
    ),
  ]);

  const byCategory: Record<SimpleCategory, HabitEntry[]> = {
    water: [], medication: [], food: [], exercise: [], sleep: [], mood: [],
  };
  for (const row of entries ?? []) {
    byCategory[row.category as SimpleCategory]?.push({
      date: row.date, value: Number(row.value), note: row.note ?? undefined,
    });
  }

  const entriesByHabit = new Map<string, HabitEntry[]>();
  for (const row of customEntries ?? []) {
    const arr = entriesByHabit.get(row.custom_habit_id) ?? [];
    arr.push({ date: row.date, value: Number(row.value) });
    entriesByHabit.set(row.custom_habit_id, arr);
  }

  const custom: CustomHabit[] = (customHabits ?? []).map((h) => ({
    id: h.id,
    name: h.name,
    unit: h.unit,
    target: Number(h.target),
    color: h.color,
    icon: h.icon,
    entries: entriesByHabit.get(h.id) ?? [],
  }));

  return { ...byCategory, custom };
}

function entriesChanged(a: HabitEntry, b: HabitEntry) {
  return a.value !== b.value || a.note !== b.note;
}

async function syncCategory(userId: string, category: SimpleCategory, prev: HabitEntry[], next: HabitEntry[]) {
  const prevByDate = new Map(prev.map((e) => [e.date, e]));
  const changed = next.filter((e) => {
    const p = prevByDate.get(e.date);
    return !p || entriesChanged(p, e);
  });
  if (changed.length === 0) return;

  await supabase.from("habit_entries").upsert(
    changed.map((e) => ({ user_id: userId, category, date: e.date, value: e.value, note: e.note ?? null })),
    { onConflict: "user_id,category,date" },
  );
}

async function syncCustom(userId: string, prev: CustomHabit[], next: CustomHabit[]) {
  const prevById = new Map(prev.map((h) => [h.id, h]));
  const nextIds = new Set(next.map((h) => h.id));

  const deleted = prev.filter((h) => !nextIds.has(h.id));
  if (deleted.length > 0) {
    await supabase.from("custom_habits").delete().eq("user_id", userId).in("id", deleted.map((h) => h.id));
  }

  for (const habit of next) {
    const prevHabit = prevById.get(habit.id);
    if (!prevHabit) {
      await supabase.from("custom_habits").insert({
        id: habit.id, user_id: userId, name: habit.name, unit: habit.unit, target: habit.target,
        color: habit.color, icon: habit.icon,
      });
    }

    const prevEntries = prevHabit?.entries ?? [];
    const prevByDate = new Map(prevEntries.map((e) => [e.date, e]));
    const changedEntries = habit.entries.filter((e) => {
      const p = prevByDate.get(e.date);
      return !p || p.value !== e.value;
    });
    if (changedEntries.length > 0) {
      await supabase.from("custom_habit_entries").upsert(
        changedEntries.map((e) => ({ custom_habit_id: habit.id, user_id: userId, date: e.date, value: e.value })),
        { onConflict: "custom_habit_id,date" },
      );
    }
  }
}

export function useHabitData(userId: string | null) {
  const [data, setDataState] = useState<HabitData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const prevRef = useRef<HabitData>(EMPTY_DATA);

  useEffect(() => {
    if (!userId) {
      setDataState(EMPTY_DATA);
      prevRef.current = EMPTY_DATA;
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchHabitData(userId).then((fetched) => {
      setDataState(fetched);
      prevRef.current = fetched;
      setLoading(false);
    });
  }, [userId]);

  function setData(next: HabitData) {
    const prev = prevRef.current;
    setDataState(next);
    prevRef.current = next;
    if (!userId) return;

    for (const category of SIMPLE_CATEGORIES) {
      if (next[category] !== prev[category]) {
        void syncCategory(userId, category, prev[category], next[category]);
      }
    }
    if (next.custom !== prev.custom) {
      void syncCustom(userId, prev.custom, next.custom);
    }
  }

  return { data, setData, loading };
}

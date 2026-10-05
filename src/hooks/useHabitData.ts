import { useCallback, useEffect, useRef, useState } from "react";
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

// ── Saving ─────────────────────────────────────────────────────────────────
//
// A change marks what it touched as "dirty" (one key per entry, custom habit or
// custom habit entry). Saves then run one at a time, each sending the *latest*
// value of every dirty key, so rapid taps can't land out of order and a later
// save can't be overwritten by an earlier one that arrived late. A key stays
// dirty until a save of its current version succeeds, so a failed save is
// retried on the next change, when the tab comes back into view, when the
// connection returns, or when the member taps Retry.

type DirtyKey =
  | `entry|${SimpleCategory}|${string}`
  | `habit|${string}`
  | `centry|${string}|${string}`;

const entriesChanged = (a: HabitEntry, b: HabitEntry) => a.value !== b.value || a.note !== b.note;

/** What changed between two states, as dirty keys. Entries removed from a list are left alone, as before. */
function diffKeys(prev: HabitData, next: HabitData): DirtyKey[] {
  const keys: DirtyKey[] = [];
  for (const category of SIMPLE_CATEGORIES) {
    if (next[category] === prev[category]) continue;
    const before = new Map(prev[category].map((e) => [e.date, e]));
    for (const e of next[category]) {
      const p = before.get(e.date);
      if (!p || entriesChanged(p, e)) keys.push(`entry|${category}|${e.date}`);
    }
  }
  if (next.custom !== prev.custom) {
    const before = new Map(prev.custom.map((h) => [h.id, h]));
    const nextIds = new Set(next.custom.map((h) => h.id));
    for (const h of prev.custom) if (!nextIds.has(h.id)) keys.push(`habit|${h.id}`);
    for (const h of next.custom) {
      const p = before.get(h.id);
      if (!p || p.name !== h.name || p.unit !== h.unit || p.target !== h.target || p.color !== h.color || p.icon !== h.icon) {
        keys.push(`habit|${h.id}`);
      }
      const pe = new Map((p?.entries ?? []).map((e) => [e.date, e]));
      for (const e of h.entries) {
        const q = pe.get(e.date);
        if (!q || q.value !== e.value) keys.push(`centry|${h.id}|${e.date}`);
      }
    }
  }
  return keys;
}

/** Sends the current values of these keys. Throws on the first failure. */
async function saveKeys(userId: string, data: HabitData, keys: DirtyKey[]) {
  const rows: Record<SimpleCategory, { user_id: string; category: string; date: string; value: number; note: string | null }[]> =
    { water: [], medication: [], food: [], exercise: [], sleep: [], mood: [] };
  const habitUpserts: CustomHabit[] = [];
  const habitDeletes: string[] = [];
  const customRows: { custom_habit_id: string; user_id: string; date: string; value: number }[] = [];

  for (const key of keys) {
    const [kind, a, b] = key.split("|");
    if (kind === "entry") {
      const e = data[a as SimpleCategory].find((x) => x.date === b);
      if (e) rows[a as SimpleCategory].push({ user_id: userId, category: a, date: e.date, value: e.value, note: e.note ?? null });
    } else if (kind === "habit") {
      const h = data.custom.find((x) => x.id === a);
      if (h) habitUpserts.push(h);
      else habitDeletes.push(a);
    } else {
      const h = data.custom.find((x) => x.id === a);
      const e = h?.entries.find((x) => x.date === b);
      if (h && e) customRows.push({ custom_habit_id: h.id, user_id: userId, date: e.date, value: e.value });
    }
  }

  const check = ({ error }: { error: { message: string } | null }) => { if (error) throw new Error(error.message); };
  for (const category of SIMPLE_CATEGORIES) {
    if (rows[category].length) {
      check(await supabase.from("habit_entries").upsert(rows[category], { onConflict: "user_id,category,date" }));
    }
  }
  if (habitDeletes.length) {
    check(await supabase.from("custom_habits").delete().eq("user_id", userId).in("id", habitDeletes));
  }
  if (habitUpserts.length) {
    // Habits before their entries, which reference them.
    check(await supabase.from("custom_habits").upsert(habitUpserts.map((h) => ({
      id: h.id, user_id: userId, name: h.name, unit: h.unit, target: h.target, color: h.color, icon: h.icon,
    }))));
  }
  const live = customRows.filter((r) => !habitDeletes.includes(r.custom_habit_id));
  if (live.length) {
    check(await supabase.from("custom_habit_entries").upsert(live, { onConflict: "custom_habit_id,date" }));
  }
}

export type SaveState = "saved" | "saving" | "error";
export type HabitUpdate = HabitData | ((prev: HabitData) => HabitData);

export function useHabitData(userId: string | null) {
  const [data, setDataState] = useState<HabitData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  // The latest state, ahead of React's: changes apply to this, so two changes in a row can't undo each other.
  const latest = useRef<HabitData>(EMPTY_DATA);
  const loaded = useRef(false);
  // Dirty key → version; a key is cleared only if it wasn't changed again while saving.
  const dirty = useRef(new Map<DirtyKey, number>());
  const version = useRef(0);
  const saving = useRef(false);
  // Every list that has been part of a state. A change built from an older render
  // carries old lists for the parts it didn't touch; recognising them stops that
  // change from undoing something saved in between.
  const seenLists = useRef(new WeakSet<object>());
  const remember = (d: HabitData) => {
    for (const c of SIMPLE_CATEGORIES) seenLists.current.add(d[c]);
    seenLists.current.add(d.custom);
  };
  const userRef = useRef(userId);
  userRef.current = userId;

  const flush = useCallback(async () => {
    const uid = userRef.current;
    if (saving.current || !uid || !loaded.current || dirty.current.size === 0) return;
    saving.current = true;
    setSaveState("saving");
    try {
      while (dirty.current.size > 0 && userRef.current === uid) {
        const batch = new Map(dirty.current);
        await saveKeys(uid, latest.current, [...batch.keys()]);
        for (const [key, v] of batch) if (dirty.current.get(key) === v) dirty.current.delete(key);
      }
      setSaveState("saved");
    } catch (err) {
      console.error("Fikko couldn't save habits:", err);
      setSaveState("error");
    } finally {
      saving.current = false;
    }
  }, []);

  const load = useCallback(() => {
    loaded.current = false;
    dirty.current.clear();
    latest.current = EMPTY_DATA;
    setDataState(EMPTY_DATA);
    setLoadError(null);
    setSaveState("saved");
    if (!userId) {
      setLoading(false);
      return () => {};
    }
    let live = true;
    setLoading(true);
    fetchHabitData(userId)
      .then((fetched) => {
        if (!live) return;
        latest.current = fetched;
        remember(fetched);
        loaded.current = true;
        setDataState(fetched);
        setLoading(false);
      })
      .catch((err) => {
        if (!live) return;
        console.error("Fikko couldn't load habits:", err);
        setLoadError("We couldn't load your habits. Check your connection and try again.");
        setLoading(false);
      });
    return () => { live = false; };
  }, [userId]);

  useEffect(() => load(), [load]);

  // Retry unsaved changes when the member comes back to the tab or the connection returns.
  useEffect(() => {
    const retry = () => { if (document.visibilityState === "visible") void flush(); };
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", retry);
    return () => {
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", retry);
    };
  }, [flush]);

  /**
   * Applies a change and saves it. Pass a function to build on the very latest
   * state (needed when the change is computed after an await). Ignored until
   * the member's data has loaded, so nothing is saved on top of an empty page.
   */
  const setData = useCallback((update: HabitUpdate) => {
    if (!loaded.current) return;
    const prev = latest.current;
    let next = typeof update === "function" ? update(prev) : update;
    if (next === prev) return;
    // Keep the latest version of anything this change didn't actually touch.
    const fresh = { ...next };
    for (const c of SIMPLE_CATEGORIES) {
      if (next[c] !== prev[c] && seenLists.current.has(next[c])) fresh[c] = prev[c];
    }
    if (next.custom !== prev.custom && seenLists.current.has(next.custom)) fresh.custom = prev.custom;
    next = fresh;
    latest.current = next;
    remember(next);
    setDataState(next);
    for (const key of diffKeys(prev, next)) dirty.current.set(key, ++version.current);
    void flush();
  }, [flush]);

  const retrySave = useCallback(() => { void flush(); }, [flush]);

  return { data, setData, loading, loadError, reload: load, saveState, retrySave };
}

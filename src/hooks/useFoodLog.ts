import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import type { FoodLogItem, HabitData, MacrosPer100g, MealKey } from "../types";
import type { HabitUpdate } from "./useHabitData";

const MEAL_KEYS: MealKey[] = ["breakfast", "lunch", "dinner", "snacks"];

export type NewFood = { name: string; grams: number; caloriesPer100g: number } & MacrosPer100g;

function round(n: number) {
  return Math.round(n * 10) / 10;
}

/** Calories per meal for a list of foods. */
export function mealTotals(items: FoodLogItem[]): Record<MealKey, number> {
  const totals: Record<MealKey, number> = { breakfast: 0, lunch: 0, dinner: 0, snacks: 0 };
  for (const item of items) totals[item.meal] += item.calories;
  return Object.fromEntries(MEAL_KEYS.map((k) => [k, round(totals[k])])) as Record<MealKey, number>;
}

const SAVE_FAILED = "That didn't save. Check your connection and try again.";

/**
 * One day's food log. The foods themselves are rows in food_log_items; the
 * day's habit entry holds their totals per meal (for the Dashboard and history),
 * rebuilt from the foods whenever they change.
 *
 * Nothing can be added until the day's foods have loaded (`ready`): building
 * the totals from a list that hasn't loaded yet is how a day's earlier meals got
 * wiped. A save that fails is undone on screen and explained in `error`.
 */
export function useFoodLog(
  userId: string | null,
  date: string,
  // Kept for callers; the totals are now built on the latest habit data instead.
  _data: HabitData,
  onChange: (update: HabitUpdate) => void,
) {
  const [items, setItemsState] = useState<FoodLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // The latest list, for changes made after an await (a saved meal, a photo log).
  const itemsRef = useRef<FoodLogItem[]>([]);
  const readyRef = useRef(false);
  const dateRef = useRef(date);
  dateRef.current = date;

  const setItems = (next: FoodLogItem[]) => {
    itemsRef.current = next;
    setItemsState(next);
  };

  useEffect(() => {
    readyRef.current = false;
    setItems([]);
    setError(null);
    setLoadError(null);
    if (!userId) {
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    supabase
      .from("food_log_items")
      .select("id, meal, name, grams, calories_per_100g, calories, protein_per_100g, carbs_per_100g, fat_per_100g")
      .eq("user_id", userId)
      .eq("date", date)
      .then(({ data: rows, error: err }) => {
        // A slower answer for a day the member has already moved away from is ignored.
        if (!live) return;
        if (err) {
          console.error("Fikko couldn't load the food log:", err);
          setLoadError("We couldn't load this day's meals. Check your connection and try again.");
          setLoading(false);
          return;
        }
        const loaded: FoodLogItem[] = (rows ?? []).map((r) => ({
          id: r.id,
          meal: r.meal as MealKey,
          name: r.name,
          grams: Number(r.grams),
          caloriesPer100g: Number(r.calories_per_100g),
          calories: Number(r.calories),
          proteinPer100g: r.protein_per_100g == null ? null : Number(r.protein_per_100g),
          carbsPer100g: r.carbs_per_100g == null ? null : Number(r.carbs_per_100g),
          fatPer100g: r.fat_per_100g == null ? null : Number(r.fat_per_100g),
        }));
        setItems(loaded);
        readyRef.current = true;
        setLoading(false);
        // Repair a day whose saved totals drifted from its foods (a save that failed
        // before failures were caught). Days with no foods keep their totals: they may
        // be from before each food was logged separately.
        if (loaded.length) syncAggregate(loaded, date, undefined, true);
      });
    return () => { live = false; };
  }, [userId, date, reloadKey]);

  /**
   * Rebuilds this day's totals from the foods, on the latest habit data. `base`
   * is for a voice check-in that changes other habits in the same save.
   */
  const syncAggregate = useCallback((nextItems: FoodLogItem[], forDate: string, base?: HabitData, onlyIfDifferent = false) => {
    const totals = mealTotals(nextItems);
    const dayTotal = round(MEAL_KEYS.reduce((sum, k) => sum + totals[k], 0));
    const note = JSON.stringify(totals);
    onChange((prev) => {
      const from = base ?? prev;
      const existing = from.food.find((e) => e.date === forDate);
      if (onlyIfDifferent && existing && existing.value === dayTotal && existing.note === note) return prev;
      const food = existing
        ? from.food.map((e) => (e.date === forDate ? { ...e, value: dayTotal, note } : e))
        : [...from.food, { date: forDate, value: dayTotal, note }];
      return { ...from, food };
    });
  }, [onChange]);

  /** Applies a change on screen, saves it, and undoes it if the save fails. */
  async function change(next: FoodLogItem[], save: () => PromiseLike<{ error: { message: string } | null }>, base?: HabitData) {
    const before = itemsRef.current;
    const forDate = dateRef.current;
    setError(null);
    setItems(next);
    syncAggregate(next, forDate, base);
    const { error: err } = await save();
    if (!err) return true;
    console.error("Fikko couldn't save the food log:", err);
    // Undo, unless the member has already moved to another day.
    if (dateRef.current === forDate) {
      setItems(before);
      syncAggregate(before, forDate);
      setError(SAVE_FAILED);
    }
    return false;
  }

  async function addItem(meal: MealKey, food: NewFood) {
    return addItems(meal, [food]);
  }

  /** Logs several foods at once, e.g. a saved meal or yesterday's breakfast. */
  async function addItems(meal: MealKey, foods: NewFood[]) {
    return addEntries(foods.map((f) => ({ ...f, meal })));
  }

  /** Logs foods across any meals in one go, on top of `base` when other habits changed too. */
  async function addEntries(entries: (NewFood & { meal: MealKey })[], base?: HabitData) {
    if (!userId || !entries.length) return false;
    if (!readyRef.current) {
      setError("This day's meals are still loading. Try again in a moment.");
      return false;
    }
    const forDate = dateRef.current;
    const newItems: FoodLogItem[] = entries.map(({ meal, ...food }) => ({
      id: crypto.randomUUID(),
      meal,
      name: food.name,
      grams: food.grams,
      caloriesPer100g: food.caloriesPer100g,
      calories: round((food.caloriesPer100g * food.grams) / 100),
      proteinPer100g: food.proteinPer100g ?? null,
      carbsPer100g: food.carbsPer100g ?? null,
      fatPer100g: food.fatPer100g ?? null,
    }));
    return change([...itemsRef.current, ...newItems], () => supabase.from("food_log_items").insert(newItems.map((i) => ({
      id: i.id,
      user_id: userId,
      date: forDate,
      meal: i.meal,
      name: i.name,
      grams: i.grams,
      calories_per_100g: i.caloriesPer100g,
      calories: i.calories,
      protein_per_100g: i.proteinPer100g,
      carbs_per_100g: i.carbsPer100g,
      fat_per_100g: i.fatPer100g,
    }))), base);
  }

  async function updateGrams(itemId: string, grams: number) {
    if (!readyRef.current) return false;
    const next = itemsRef.current.map((item) =>
      item.id === itemId ? { ...item, grams, calories: round((item.caloriesPer100g * grams) / 100) } : item,
    );
    const updated = next.find((i) => i.id === itemId);
    if (!updated) return false;
    return change(next, () => supabase.from("food_log_items").update({ grams, calories: updated.calories }).eq("id", itemId));
  }

  async function deleteItem(itemId: string) {
    if (!readyRef.current) return false;
    return change(itemsRef.current.filter((item) => item.id !== itemId), () => supabase.from("food_log_items").delete().eq("id", itemId));
  }

  return {
    items,
    loading,
    /** True once this day's foods have loaded, so adding is safe. */
    ready: !loading && !loadError,
    loadError,
    /** Why the last change didn't save, if it didn't. */
    error,
    clearError: () => setError(null),
    reload: () => setReloadKey((k) => k + 1),
    addItem, addItems, addEntries, updateGrams, deleteItem,
  };
}

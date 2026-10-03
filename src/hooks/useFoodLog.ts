import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { FoodLogItem, HabitData, MacrosPer100g, MealKey } from "../types";

const MEAL_KEYS: MealKey[] = ["breakfast", "lunch", "dinner", "snacks"];

export type NewFood = { name: string; grams: number; caloriesPer100g: number } & MacrosPer100g;

function round(n: number) {
  return Math.round(n * 10) / 10;
}

export function useFoodLog(
  userId: string | null,
  date: string,
  data: HabitData,
  onChange: (data: HabitData) => void,
) {
  const [items, setItems] = useState<FoodLogItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("food_log_items")
      .select("id, meal, name, grams, calories_per_100g, calories, protein_per_100g, carbs_per_100g, fat_per_100g")
      .eq("user_id", userId)
      .eq("date", date)
      .then(({ data: rows }) => {
        setItems(
          (rows ?? []).map((r) => ({
            id: r.id,
            meal: r.meal as MealKey,
            name: r.name,
            grams: Number(r.grams),
            caloriesPer100g: Number(r.calories_per_100g),
            calories: Number(r.calories),
            proteinPer100g: r.protein_per_100g == null ? null : Number(r.protein_per_100g),
            carbsPer100g: r.carbs_per_100g == null ? null : Number(r.carbs_per_100g),
            fatPer100g: r.fat_per_100g == null ? null : Number(r.fat_per_100g),
          })),
        );
        setLoading(false);
      });
  }, [userId, date]);

  // `base` lets a caller that's changing other habits at the same moment (a
  // voice check-in) save everything in one update instead of two that race.
  function syncAggregate(nextItems: FoodLogItem[], base: HabitData = data) {
    const mealTotals: Record<MealKey, number> = { breakfast: 0, lunch: 0, dinner: 0, snacks: 0 };
    for (const item of nextItems) mealTotals[item.meal] += item.calories;
    const dayTotal = MEAL_KEYS.reduce((sum, k) => sum + mealTotals[k], 0);

    const rounded = Object.fromEntries(MEAL_KEYS.map((k) => [k, round(mealTotals[k])]));
    const note = JSON.stringify(rounded);
    const existing = base.food.find((e) => e.date === date);
    const food = existing
      ? base.food.map((e) => (e.date === date ? { ...e, value: round(dayTotal), note } : e))
      : [...base.food, { date, value: round(dayTotal), note }];

    onChange({ ...base, food });
  }

  async function addItem(meal: MealKey, food: NewFood) {
    await addItems(meal, [food]);
  }

  /** Logs several foods at once, e.g. a saved meal or yesterday's breakfast. */
  async function addItems(meal: MealKey, foods: NewFood[]) {
    await addEntries(foods.map((f) => ({ ...f, meal })));
  }

  /** Logs foods across any meals in one go, on top of `base` when other habits changed too. */
  async function addEntries(entries: (NewFood & { meal: MealKey })[], base?: HabitData) {
    if (!userId || !entries.length) return;
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
    const next = [...items, ...newItems];
    setItems(next);
    syncAggregate(next, base);
    await supabase.from("food_log_items").insert(newItems.map((i) => ({
      id: i.id,
      user_id: userId,
      date,
      meal: i.meal,
      name: i.name,
      grams: i.grams,
      calories_per_100g: i.caloriesPer100g,
      calories: i.calories,
      protein_per_100g: i.proteinPer100g,
      carbs_per_100g: i.carbsPer100g,
      fat_per_100g: i.fatPer100g,
    })));
  }

  async function updateGrams(itemId: string, grams: number) {
    const next = items.map((item) =>
      item.id === itemId ? { ...item, grams, calories: round((item.caloriesPer100g * grams) / 100) } : item,
    );
    setItems(next);
    syncAggregate(next);
    const updated = next.find((i) => i.id === itemId)!;
    await supabase.from("food_log_items").update({ grams, calories: updated.calories }).eq("id", itemId);
  }

  async function deleteItem(itemId: string) {
    const next = items.filter((item) => item.id !== itemId);
    setItems(next);
    syncAggregate(next);
    await supabase.from("food_log_items").delete().eq("id", itemId);
  }

  return { items, loading, addItem, addItems, addEntries, updateGrams, deleteItem };
}

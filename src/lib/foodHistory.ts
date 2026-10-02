import { supabase } from "./supabase";
import type { FoodLogItem, MealKey } from "../types";

// What a member has eaten before, for one-tap repeats in the meal log.

const toItem = (r: Record<string, unknown>): FoodLogItem => ({
  id: String(r.id),
  meal: r.meal as MealKey,
  name: String(r.name),
  grams: Number(r.grams),
  caloriesPer100g: Number(r.calories_per_100g),
  calories: Number(r.calories),
  proteinPer100g: r.protein_per_100g == null ? null : Number(r.protein_per_100g),
  carbsPer100g: r.carbs_per_100g == null ? null : Number(r.carbs_per_100g),
  fatPer100g: r.fat_per_100g == null ? null : Number(r.fat_per_100g),
});

const COLUMNS = "id, meal, name, grams, calories_per_100g, calories, protein_per_100g, carbs_per_100g, fat_per_100g";

/** What was logged for one meal on one day. */
export async function mealItemsOn(userId: string, date: string, meal: MealKey): Promise<FoodLogItem[]> {
  const { data } = await supabase.from("food_log_items").select(COLUMNS)
    .eq("user_id", userId).eq("date", date).eq("meal", meal);
  return (data ?? []).map(toItem);
}

/**
 * Foods logged in the last 30 days, most recent first, one per name, each
 * with the amount last used. Foods usually eaten at this meal come first.
 */
export async function recentFoods(userId: string, meal: MealKey, limit = 8): Promise<FoodLogItem[]> {
  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const { data } = await supabase.from("food_log_items").select(`${COLUMNS}, date`)
    .eq("user_id", userId).gte("date", since)
    .order("date", { ascending: false }).limit(300);
  const byName = new Map<string, { item: FoodLogItem; atMeal: number; last: number }>();
  (data ?? []).forEach((r, i) => {
    const item = toItem(r);
    const key = item.name.toLowerCase();
    const seen = byName.get(key);
    if (!seen) byName.set(key, { item, atMeal: item.meal === meal ? 1 : 0, last: i });
    else if (item.meal === meal) seen.atMeal++;
  });
  return [...byName.values()]
    .sort((a, b) => (b.atMeal > 0 ? 1 : 0) - (a.atMeal > 0 ? 1 : 0) || a.last - b.last)
    .slice(0, limit)
    .map((x) => x.item);
}

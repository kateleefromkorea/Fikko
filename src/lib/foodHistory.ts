import { supabase } from "./supabase";
import type { FoodLogItem, MealKey } from "../types";
import { shiftDateKey } from "./dates";

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
  const [{ data }, hidden] = await Promise.all([
    supabase.from("food_log_items").select(`${COLUMNS}, date`)
      .eq("user_id", userId).gte("date", since)
      .order("date", { ascending: false }).limit(300),
    hiddenRecent(userId),
  ]);
  const byName = new Map<string, { item: FoodLogItem; atMeal: number; last: number }>();
  (data ?? []).forEach((r, i) => {
    const item = toItem(r);
    const key = item.name.toLowerCase();
    if (hidden.has(key)) return;
    const seen = byName.get(key);
    if (!seen) byName.set(key, { item, atMeal: item.meal === meal ? 1 : 0, last: i });
    else if (item.meal === meal) seen.atMeal++;
  });
  return [...byName.values()]
    .sort((a, b) => (b.atMeal > 0 ? 1 : 0) - (a.atMeal > 0 ? 1 : 0) || a.last - b.last)
    .slice(0, limit)
    .map((x) => x.item);
}

// Foods a member has removed from their Recent list. Only the list changes:
// past log entries stay, so old days keep their totals.

async function hiddenRecent(userId: string): Promise<Set<string>> {
  const { data } = await supabase.from("hidden_recent_foods").select("name").eq("user_id", userId);
  return new Set((data ?? []).map((r) => String(r.name)));
}

/** Takes a food off the Recent list. */
export async function hideRecentFood(userId: string, name: string) {
  const { error } = await supabase.from("hidden_recent_foods")
    .upsert({ user_id: userId, name: name.toLowerCase().slice(0, 200) }, { onConflict: "user_id,name", ignoreDuplicates: true });
  if (error) throw error;
}

/** Puts a food back on the Recent list, once it's logged again. */
export async function unhideRecentFood(userId: string, name: string) {
  await supabase.from("hidden_recent_foods").delete().eq("user_id", userId).eq("name", name.toLowerCase().slice(0, 200));
}

/** One-tap repeats for a meal on the Calories card. */
export interface MealShortcuts {
  /** What was logged for this meal the day before. */
  yesterday: FoodLogItem[];
  /** Foods eaten at this meal on at least USUAL_DAYS different days lately, most often first, each at its last amount. */
  usual: FoodLogItem[];
}

/** Days a food has to have been eaten at a meal before it's offered as a usual. */
const USUAL_DAYS = 2;
const USUAL_SHOWN = 2;

/**
 * Shortcuts for every meal, from the 30 days before `date`, in one query: the
 * meal as it was the day before, and the foods usually eaten at it. Foods the
 * member removed from Recent are left out.
 */
export async function mealShortcuts(userId: string, date: string): Promise<Record<MealKey, MealShortcuts>> {
  const day = (offset: number) => shiftDateKey(date, offset);
  const before = day(-1);
  const [{ data }, hidden] = await Promise.all([
    supabase.from("food_log_items").select(`${COLUMNS}, date`)
      .eq("user_id", userId).gte("date", day(-30)).lte("date", before)
      .order("date", { ascending: false }).limit(500),
    hiddenRecent(userId),
  ]);

  const meals: MealKey[] = ["breakfast", "lunch", "dinner", "snacks"];
  const out = Object.fromEntries(meals.map((m): [MealKey, MealShortcuts] => [m, { yesterday: [], usual: [] }])) as Record<MealKey, MealShortcuts>;
  // Per meal and food: the days it was eaten, and its latest entry (rows come newest first).
  const seen = new Map<string, { item: FoodLogItem; days: Set<string>; order: number }>();
  (data ?? []).forEach((r, i) => {
    const item = toItem(r);
    const date = String(r.date);
    if (date === before && out[item.meal]) out[item.meal].yesterday.push(item);
    const name = item.name.toLowerCase();
    if (hidden.has(name)) return;
    const key = `${item.meal}|${name}`;
    const entry = seen.get(key) ?? { item, days: new Set<string>(), order: i };
    entry.days.add(date);
    seen.set(key, entry);
  });
  for (const m of meals) {
    out[m].usual = [...seen.entries()]
      .filter(([key, e]) => key.startsWith(`${m}|`) && e.days.size >= USUAL_DAYS)
      .sort(([, a], [, b]) => b.days.size - a.days.size || a.order - b.order)
      .slice(0, USUAL_SHOWN)
      .map(([, e]) => e.item);
  }
  return out;
}

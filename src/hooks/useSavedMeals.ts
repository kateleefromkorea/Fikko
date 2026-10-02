import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { MacrosPer100g } from "../types";

/** One food inside a saved meal: everything needed to log it again. */
export interface SavedMealItem extends MacrosPer100g {
  name: string;
  grams: number;
  caloriesPer100g: number;
}

export interface SavedMeal {
  id: string;
  name: string;
  items: SavedMealItem[];
}

export const savedMealCalories = (meal: SavedMeal) =>
  meal.items.reduce((sum, i) => sum + (i.caloriesPer100g * i.grams) / 100, 0);

/** The member's saved meals ("My usual breakfast"), logged together in one tap. */
export function useSavedMeals(userId: string | null) {
  const [meals, setMeals] = useState<SavedMeal[]>([]);

  useEffect(() => {
    if (!userId) {
      setMeals([]);
      return;
    }
    supabase
      .from("saved_meals")
      .select("id, name, items")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setMeals((data ?? []) as SavedMeal[]));
  }, [userId]);

  async function saveMeal(name: string, items: SavedMealItem[]) {
    if (!userId) return;
    const trimmed = name.trim().slice(0, 60);
    if (!trimmed || !items.length) return;
    const meal: SavedMeal = { id: crypto.randomUUID(), name: trimmed, items: items.slice(0, 30) };
    setMeals((prev) => [meal, ...prev]);
    const { error } = await supabase.from("saved_meals").insert({ ...meal, user_id: userId });
    if (error) {
      setMeals((prev) => prev.filter((m) => m.id !== meal.id));
      throw new Error("We couldn't save that meal. Please try again.");
    }
  }

  async function deleteMeal(id: string) {
    setMeals((prev) => prev.filter((m) => m.id !== id));
    await supabase.from("saved_meals").delete().eq("id", id);
  }

  return { meals, saveMeal, deleteMeal };
}

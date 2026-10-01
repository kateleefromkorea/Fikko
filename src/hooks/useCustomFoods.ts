import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { FoodResult } from "../lib/usdaFoodSearch";
import type { MacrosPer100g } from "../types";

export function useCustomFoods(userId: string | null) {
  const [foods, setFoods] = useState<FoodResult[]>([]);

  useEffect(() => {
    if (!userId) {
      setFoods([]);
      return;
    }
    supabase
      .from("custom_foods")
      .select("id, name, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g")
      .eq("user_id", userId)
      .then(({ data }) => {
        setFoods(
          (data ?? []).map((r) => ({
            id: r.id,
            name: r.name,
            caloriesPer100g: Number(r.calories_per_100g),
            proteinPer100g: r.protein_per_100g == null ? null : Number(r.protein_per_100g),
            carbsPer100g: r.carbs_per_100g == null ? null : Number(r.carbs_per_100g),
            fatPer100g: r.fat_per_100g == null ? null : Number(r.fat_per_100g),
            saved: true,
          })),
        );
      });
  }, [userId]);

  // Called after a manual entry so the same food can be picked from search later.
  async function saveFood(name: string, caloriesPer100g: number, macros: MacrosPer100g = {}) {
    if (!userId) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    // Already saved under this name — nothing to do.
    if (foods.some((f) => f.name.toLowerCase() === trimmed.toLowerCase())) return;

    const id = crypto.randomUUID();
    setFoods((prev) => [...prev, { id, name: trimmed, caloriesPer100g, ...macros, saved: true }]);
    await supabase.from("custom_foods").insert({
      id,
      user_id: userId,
      name: trimmed,
      calories_per_100g: caloriesPer100g,
      protein_per_100g: macros.proteinPer100g ?? null,
      carbs_per_100g: macros.carbsPer100g ?? null,
      fat_per_100g: macros.fatPer100g ?? null,
    });
  }

  return { foods, saveFood };
}

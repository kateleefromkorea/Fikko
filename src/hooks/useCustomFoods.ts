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
      .select("id, name, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, barcode")
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
            barcode: r.barcode ?? undefined,
            saved: true,
          })),
        );
      });
  }, [userId]);

  // Called after a manual entry so the same food can be picked from search later.
  // A barcode, when given, lets a scan of the same product find this food next time.
  async function saveFood(name: string, caloriesPer100g: number, macros: MacrosPer100g = {}, barcode?: string) {
    if (!userId) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = foods.find((f) => f.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      // Already saved under this name; just remember the barcode if it's new.
      if (barcode && !existing.barcode) {
        setFoods((prev) => prev.map((f) => (f.id === existing.id ? { ...f, barcode } : f)));
        const { error } = await supabase.from("custom_foods").update({ barcode }).eq("id", existing.id);
        if (error) {
          console.error("Couldn't save the barcode", error);
          setFoods((prev) => prev.map((f) => (f.id === existing.id ? { ...f, barcode: undefined } : f)));
        }
      }
      return;
    }

    const id = crypto.randomUUID();
    setFoods((prev) => [...prev, { id, name: trimmed, caloriesPer100g, ...macros, barcode, saved: true }]);
    const { error } = await supabase.from("custom_foods").insert({
      id,
      user_id: userId,
      name: trimmed,
      calories_per_100g: caloriesPer100g,
      protein_per_100g: macros.proteinPer100g ?? null,
      carbs_per_100g: macros.carbsPer100g ?? null,
      fat_per_100g: macros.fatPer100g ?? null,
      ...(barcode ? { barcode } : {}),
    });
    // The food was still logged; it just won't be offered in search next time.
    if (error) {
      console.error("Couldn't save the food to My foods", error);
      setFoods((prev) => prev.filter((f) => f.id !== id));
    }
  }

  return { foods, saveFood };
}

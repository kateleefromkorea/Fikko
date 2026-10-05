import type { MacrosPer100g } from "../types";

export interface Macros { protein: number; carbs: number; fat: number }

/** Grams of protein, carbs and fat in a portion, or null if any are unknown. */
export function macrosFor(item: MacrosPer100g & { grams: number }): Macros | null {
  const { proteinPer100g: p, carbsPer100g: c, fatPer100g: f, grams } = item;
  if (p == null || c == null || f == null) return null;
  return { protein: (p * grams) / 100, carbs: (c * grams) / 100, fat: (f * grams) / 100 };
}

/** Totals across items, plus how many items had no macro data. */
export function sumMacros(items: (MacrosPer100g & { grams: number })[]) {
  const total: Macros = { protein: 0, carbs: 0, fat: 0 };
  let missing = 0;
  for (const item of items) {
    const m = macrosFor(item);
    if (!m) { missing++; continue; }
    total.protein += m.protein;
    total.carbs += m.carbs;
    total.fat += m.fat;
  }
  return { total, missing };
}

/** "P 12 g · C 30 g · F 5 g" */
export const formatMacros = (m: Macros) =>
  `P ${Math.round(m.protein)} g · C ${Math.round(m.carbs)} g · F ${Math.round(m.fat)} g`;

/**
 * Daily protein, carbs and fat targets, in grams, from the calorie target and goal.
 *   Protein: by body weight where known (1.6 g/kg losing weight, 1.8 building muscle,
 *     1.2 otherwise), else 25% of calories; kept between 15% and 35% of calories.
 *   Fat: 30% of calories (25% when building muscle).
 *   Carbs: the calories left over.
 * General guidance for healthy adults, not a prescription.
 */
export function macroTargets({ calories, goalKey, weightKg }: {
  calories: number; goalKey?: string | null; weightKg?: number | null;
}): Macros {
  const perKg = goalKey === "muscle_building" ? 1.8 : goalKey === "weight_loss" ? 1.6 : 1.2;
  const byWeight = weightKg ? weightKg * perKg : (calories * 0.25) / 4;
  const protein = Math.min(Math.max(byWeight, (calories * 0.15) / 4), (calories * 0.35) / 4);
  const fat = (calories * (goalKey === "muscle_building" ? 0.25 : 0.3)) / 9;
  const carbs = Math.max(0, (calories - protein * 4 - fat * 9) / 4);
  return { protein: Math.round(protein), carbs: Math.round(carbs), fat: Math.round(fat) };
}

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

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

/** Below this, carbs stop falling and fat gives way instead (unless the member eats low-carb or keto). */
const CARB_FLOOR_G = 100;
const KETO_CARBS_G = 30;
const LOW_CARB_G = 100;
/** Fat never goes below this many grams per kg of reference weight. */
const FAT_FLOOR_PER_KG = 0.6;

/**
 * The body weight protein and fat are worked out from: the lowest of current
 * weight, target weight and the weight at a BMI of 27 for their height, so a
 * heavy member isn't asked to eat more protein than is realistic.
 */
export function referenceWeight({ weightKg, targetWeightKg, heightCm }: {
  weightKg?: number | null; targetWeightKg?: number | null; heightCm?: number | null;
}): number | null {
  const options = [weightKg, targetWeightKg, heightCm ? 27 * (heightCm / 100) ** 2 : null]
    .filter((v): v is number => v != null && v > 0);
  return options.length ? Math.min(...options) : null;
}

/**
 * Daily protein, carbs and fat targets, in grams, from the calorie target and goal.
 * When the calorie target moves, protein stays put, fat follows its share, and
 * carbs take up the difference:
 *   Protein: by reference weight (1.6 g/kg losing weight, 1.8 building muscle,
 *     1.2 otherwise), else 25% of calories; kept between 15% and 35% of calories.
 *   Fat: 30% of calories (25% building muscle), never under 0.6 g/kg.
 *   Carbs: the calories left over. Below 100 g, fat gives way first (down to its floor).
 *   Keto keeps carbs at 30 g and Low-carb at 100 g; fat takes the rest.
 * General guidance for healthy adults, not a prescription.
 */
export function macroTargets({ calories, goalKey, weightKg, targetWeightKg, heightCm, diets = [] }: {
  calories: number; goalKey?: string | null; weightKg?: number | null;
  targetWeightKg?: number | null; heightCm?: number | null; diets?: string[];
}): Macros {
  const ref = referenceWeight({ weightKg, targetWeightKg, heightCm });
  const perKg = goalKey === "muscle_building" ? 1.8 : goalKey === "weight_loss" ? 1.6 : 1.2;
  const byWeight = ref ? ref * perKg : (calories * 0.25) / 4;
  const protein = Math.min(Math.max(byWeight, (calories * 0.15) / 4), (calories * 0.35) / 4);
  const fatFloor = ref ? ref * FAT_FLOOR_PER_KG : 0;
  const left = calories - protein * 4;

  const fixedCarbs = diets.includes("Keto") ? KETO_CARBS_G : diets.includes("Low-carb") ? LOW_CARB_G : null;
  if (fixedCarbs != null) {
    const carbs = Math.max(0, Math.min(fixedCarbs, left / 4));
    const fat = Math.max(0, (left - carbs * 4) / 9);
    return { protein: Math.round(protein), carbs: Math.round(carbs), fat: Math.round(fat) };
  }

  let fat = Math.max((calories * (goalKey === "muscle_building" ? 0.25 : 0.3)) / 9, fatFloor);
  let carbs = (left - fat * 9) / 4;
  if (carbs < CARB_FLOOR_G) {
    // Take what carbs need from fat, but not below fat's floor.
    fat = Math.max(fatFloor, (left - CARB_FLOOR_G * 4) / 9);
    carbs = (left - fat * 9) / 4;
  }
  return { protein: Math.round(protein), carbs: Math.round(Math.max(0, carbs)), fat: Math.round(Math.max(0, fat)) };
}

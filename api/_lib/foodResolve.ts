// Turns a food Claude named (from speech or from a photo) into a database-backed entry
// the member can log: matches it to USDA FoodData Central when a close match exists,
// otherwise keeps Claude's own estimates of the calories and of the protein, carbs and fat,
// so the macro bars fill in for AI-logged foods too. Shared by voice check-ins and photo logging.

import { normalizeQuery, searchRegional, searchUsda, type FoodSearchHit } from "./foods.js";

export const MEALS = ["breakfast", "lunch", "dinner", "snacks"] as const;
export type Meal = (typeof MEALS)[number];

/** What Claude returns for one food. */
export interface ClaudeFood {
  meal: Meal; name: string; search_term: string; grams: number; kcal: number;
  /** Claude's estimate, in grams, of each macro in that portion. */
  protein_g?: number; carbs_g?: number; fat_g?: number;
}

/** A food in the proposal, ready to log. `estimated` when no database match was close enough. */
export interface ProposedFood {
  meal: Meal;
  name: string;
  grams: number;
  caloriesPer100g: number;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  fatPer100g: number | null;
  estimated: boolean;
  /** The database entry used, when one was. */
  matched?: string;
}

export const clampNum = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null;
export const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The database entry for a spoken food, when one clearly matches: its name
 * starts with the search term, and its calories for the portion are within a
 * believable range of Claude's estimate (so "rice" doesn't become rice flour).
 */
function bestMatch(term: string, grams: number, kcalEstimate: number, hits: FoodSearchHit[]) {
  const q = normalizeQuery(term).replace(/s\b/g, "");
  const words = q.split(" ").filter(Boolean);
  const scored = hits
    .map((h) => {
      const first = normalizeQuery(h.name.split(",")[0]).replace(/s\b/g, "");
      const all = normalizeQuery(h.name).replace(/s\b/g, "");
      let score = 0;
      if (first === q) score += 100;
      else if (first.startsWith(words[0] ?? "")) score += 40;
      if (words.every((w) => all.includes(w))) score += 40;
      score -= h.name.length * 0.1;
      return { h, score };
    })
    .filter((x) => x.score >= 40)
    .sort((a, b) => b.score - a.score);
  for (const { h } of scored) {
    const kcal = (h.caloriesPer100g * grams) / 100;
    if (kcalEstimate <= 0 || (kcal >= kcalEstimate * 0.5 && kcal <= kcalEstimate * 2)) return h;
  }
  return null;
}

/**
 * Per-100g protein, carbs and fat from Claude's gram estimates for the portion. They're kept
 * consistent with its calorie estimate (4 kcal a gram for protein and carbs, 9 for fat): if they
 * disagree by more than a quarter they're scaled to match it, and they can't add up to more than
 * the food weighs. Null when Claude didn't give all three.
 */
export function estimatedMacros(f: Pick<ClaudeFood, "protein_g" | "carbs_g" | "fat_g">, grams: number, kcal: number) {
  const p = clampNum(f.protein_g, 0, grams), c = clampNum(f.carbs_g, 0, grams), fat = clampNum(f.fat_g, 0, grams);
  if (p == null || c == null || fat == null) return null;
  const per100 = (x: number) => r1((x / grams) * 100);
  const energy = p * 4 + c * 4 + fat * 9;
  // Black coffee, water, diet drinks: nothing to report, and that's a real answer.
  if (kcal <= 10 && energy <= 15) return { proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 0 };
  if (energy <= 0 || kcal <= 0) return null;
  const ratio = energy / kcal;
  let scale = ratio < 0.75 || ratio > 1.25 ? 1 / ratio : 1;
  if ((p + c + fat) * scale > grams) scale = grams / (p + c + fat);
  return { proteinPer100g: per100(p * scale), carbsPer100g: per100(c * scale), fatPer100g: per100(fat * scale) };
}

export async function resolveFood(f: ClaudeFood): Promise<ProposedFood | null> {
  const grams = clampNum(f.grams, 1, 3000);
  const kcal = clampNum(f.kcal, 0, 5000);
  const name = typeof f.name === "string" ? f.name.trim().slice(0, 80) : "";
  if (!grams || kcal == null || !name || !MEALS.includes(f.meal)) return null;
  let match: FoodSearchHit | null = null;
  try {
    const term = normalizeQuery(f.search_term || name);
    // USDA and the regional databases together, so "laksa" or "nasi lemak" can match too.
    const [usda, regional] = await Promise.allSettled([searchUsda(term), searchRegional(term)]);
    match = bestMatch(f.search_term || name, grams, kcal, [
      ...(usda.status === "fulfilled" ? usda.value : []),
      ...(regional.status === "fulfilled" ? regional.value : []),
    ]);
  } catch { /* database unavailable: fall back to the estimate */ }
  // A database entry with no nutrition figures at all is no better than the estimate.
  const bare = match && match.proteinPer100g == null && match.carbsPer100g == null && match.fatPer100g == null;
  if (match && !bare) {
    return {
      meal: f.meal, name, grams: r1(grams), estimated: false, matched: match.name,
      caloriesPer100g: match.caloriesPer100g,
      proteinPer100g: match.proteinPer100g, carbsPer100g: match.carbsPer100g, fatPer100g: match.fatPer100g,
    };
  }
  const macros = estimatedMacros(f, grams, kcal);
  return {
    meal: f.meal, name, grams: r1(grams), estimated: true,
    caloriesPer100g: r1((kcal / grams) * 100),
    proteinPer100g: macros?.proteinPer100g ?? null, carbsPer100g: macros?.carbsPer100g ?? null, fatPer100g: macros?.fatPer100g ?? null,
  };
}

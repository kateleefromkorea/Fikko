// Turns a food Claude named (from speech or from a photo) into a database-backed entry
// the member can log: matches it to USDA FoodData Central when a close match exists,
// otherwise keeps Claude's own calorie estimate. Shared by voice check-ins and photo logging.

import { normalizeQuery, searchUsda, type FoodSearchHit } from "./foods.js";

export const MEALS = ["breakfast", "lunch", "dinner", "snacks"] as const;
export type Meal = (typeof MEALS)[number];

/** What Claude returns for one food. */
export interface ClaudeFood { meal: Meal; name: string; search_term: string; grams: number; kcal: number }

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

export async function resolveFood(f: ClaudeFood): Promise<ProposedFood | null> {
  const grams = clampNum(f.grams, 1, 3000);
  const kcal = clampNum(f.kcal, 0, 5000);
  const name = typeof f.name === "string" ? f.name.trim().slice(0, 80) : "";
  if (!grams || kcal == null || !name || !MEALS.includes(f.meal)) return null;
  let match: FoodSearchHit | null = null;
  try {
    match = bestMatch(f.search_term || name, grams, kcal, await searchUsda(normalizeQuery(f.search_term || name)));
  } catch { /* database unavailable: fall back to the estimate */ }
  if (match) {
    return {
      meal: f.meal, name, grams: r1(grams), estimated: false, matched: match.name,
      caloriesPer100g: match.caloriesPer100g,
      proteinPer100g: match.proteinPer100g, carbsPer100g: match.carbsPer100g, fatPer100g: match.fatPer100g,
    };
  }
  return {
    meal: f.meal, name, grams: r1(grams), estimated: true,
    caloriesPer100g: r1((kcal / grams) * 100),
    proteinPer100g: null, carbsPer100g: null, fatPer100g: null,
  };
}

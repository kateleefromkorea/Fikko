import type { MacrosPer100g } from "../types";
import { supabase } from "./supabase";

export interface FoodResult extends MacrosPer100g {
  id: string;
  name: string;
  brand?: string;
  caloriesPer100g: number;
  saved?: boolean; // true for the user's own saved foods, not database results
  /** Grams in one serving, for packaged products that list it. */
  servingGrams?: number;
  /** "generic" (USDA whole foods) or "branded" (Open Food Facts products). */
  source?: "generic" | "branded";
  barcode?: string;
}

/** How many of each kind a search shows, before "show more". */
const GENERIC_RESULTS = 6;
const BRANDED_RESULTS = 6;

// Searches go through our own /api/food-search function, which also adds
// branded products from Open Food Facts after the generic matches. It holds the USDA
// key server-side and restricts results to generic whole foods (branded
// products make USDA's results very noisy: "banana" ranked the plain fruit
// ~10th behind branded duplicates). This file re-ranks what comes back so the
// plainest match for the query wins.

function normalize(s: string) {
  return s.toLowerCase().trim().replace(/s$/, "");
}

function relevanceScore(description: string, query: string) {
  const q = normalize(query);
  const desc = description.toLowerCase();
  const firstSegment = normalize(description.split(",")[0]);

  let score = 0;
  if (firstSegment === q) score += 100;
  else if (firstSegment.startsWith(q)) score += 60;
  else if (desc.includes(q)) score += 20;

  // Prefer concise entries: "Bananas, raw" over "Bananas, dehydrated, or banana powder".
  score -= description.length * 0.1;
  return score;
}

export async function searchFoods(query: string): Promise<FoodResult[]> {
  // Normalised the same way as the server so repeat searches hit its cache.
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q) return [];

  const { data: auth } = await supabase.auth.getSession();
  const res = await fetch(`/api/food-search?q=${encodeURIComponent(q)}`, {
    headers: { "X-Fikko-Session": auth.session?.access_token ?? "" },
  });
  const data: { foods?: FoodResult[]; error?: string } = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Food search failed (${res.status})`);

  const foods = data.foods ?? [];
  // Generic foods are re-ranked so the plainest match wins; branded products keep
  // Open Food Facts' own relevance order and follow the generic ones.
  const generic = foods
    .filter((f) => f.source !== "branded")
    .map((result) => ({ result, score: relevanceScore(result.name, q) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, GENERIC_RESULTS)
    .map((r) => r.result);
  const branded = foods.filter((f) => f.source === "branded").slice(0, BRANDED_RESULTS);
  return [...generic, ...branded];
}

/** The product with this barcode, or null when Open Food Facts doesn't know it. */
export async function lookupBarcode(barcode: string): Promise<FoodResult | null> {
  const { data: auth } = await supabase.auth.getSession();
  const res = await fetch(`/api/food-search?barcode=${encodeURIComponent(barcode)}`, {
    headers: { "X-Fikko-Session": auth.session?.access_token ?? "" },
  });
  const data: { food?: FoodResult | null; error?: string } = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Barcode lookup failed (${res.status})`);
  return data.food ?? null;
}

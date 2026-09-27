export interface FoodResult {
  id: string;
  name: string;
  brand?: string;
  caloriesPer100g: number;
  saved?: boolean; // true for the user's own saved foods, not USDA results
}

// Searches go through our own /api/food-search function, which holds the USDA
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

  const res = await fetch(`/api/food-search?q=${encodeURIComponent(q)}`);
  const data: { foods?: FoodResult[]; error?: string } = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Food search failed (${res.status})`);

  return (data.foods ?? [])
    .map((result) => ({ result, score: relevanceScore(result.name, q) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((r) => r.result);
}

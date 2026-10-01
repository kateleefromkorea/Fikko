// Proxies food search to USDA FoodData Central so the API key stays on the
// server. Previously the key was bundled into the browser, which exposed it
// and meant every user shared one key's hourly quota directly.
//
// Responses are cached at Vercel's CDN for a day, keyed on the normalised
// query, so "banana" searched by a thousand users costs one USDA request.


function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

const USDA_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";
// Generic whole foods only; branded products make results very noisy.
const DATA_TYPES = "Foundation,SR Legacy";
const MAX_QUERY_LENGTH = 60;

interface UsdaFood {
  fdcId: number;
  description: string;
  brandName?: string;
  brandOwner?: string;
  foodNutrients?: { nutrientName: string; unitName: string; value: number }[];
}

export interface FoodSearchHit {
  id: string;
  name: string;
  brand?: string;
  caloriesPer100g: number;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  fatPer100g: number | null;
}

/** Lower-case and collapse whitespace, so equivalent queries share a cache entry. */
export function normalizeQuery(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function GET(request: Request) {
  const query = normalizeQuery(new URL(request.url).searchParams.get("q") ?? "");
  if (!query) return json({ error: "Enter a food to search for." }, 400);
  if (query.length > MAX_QUERY_LENGTH) return json({ error: "That search is too long." }, 400);

  // USDA_API_KEY is the server-only name. VITE_USDA_API_KEY is accepted as a
  // fallback so the existing Vercel variable keeps working during the switch.
  const apiKey = process.env.USDA_API_KEY ?? process.env.VITE_USDA_API_KEY;
  if (!apiKey) return json({ error: "Food search isn't configured on the server." }, 500);

  const url = new URL(USDA_URL);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("query", query);
  url.searchParams.set("pageSize", "25");
  url.searchParams.set("dataType", DATA_TYPES);

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return json({ error: "Food search is unavailable right now." }, 502);
  }
  // Rate limits (429) and outages are passed on but never cached.
  if (!res.ok) return json({ error: `Food search failed (${res.status}).` }, res.status === 429 ? 429 : 502);

  const data = (await res.json()) as { foods?: UsdaFood[] };
  const foods: FoodSearchHit[] = [];
  for (const food of data.foods ?? []) {
    const energy = food.foodNutrients?.find(
      (n) => n.nutrientName === "Energy" && n.unitName?.toUpperCase() === "KCAL",
    );
    if (!energy) continue;
    // Grams per 100 g, or null when USDA doesn't list it for this food.
    const grams = (name: string) => {
      const n = food.foodNutrients?.find((x) => x.nutrientName === name && x.unitName?.toUpperCase() === "G");
      return n ? Math.round(n.value * 10) / 10 : null;
    };
    foods.push({
      id: String(food.fdcId),
      name: food.description,
      brand: food.brandName || food.brandOwner || undefined,
      caloriesPer100g: energy.value,
      proteinPer100g: grams("Protein"),
      carbsPer100g: grams("Carbohydrate, by difference"),
      fatPer100g: grams("Total lipid (fat)"),
    });
  }

  return json({ foods }, 200, {
    // CDN caches for a day and may serve a stale copy for a week while it
    // refreshes; browsers always revalidate.
    "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
  });
}

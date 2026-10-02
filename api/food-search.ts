// Food search for the meal log, from two databases:
//   • USDA FoodData Central for generic whole foods ("banana", "chicken breast").
//     The key stays on the server.
//   • Open Food Facts for branded, packaged products and barcode lookups.
//
//   GET ?q=<words>       generic matches first, then branded products
//   GET ?barcode=<digits> one product, or { food: null } when it isn't known
//
// Responses are cached at Vercel's CDN, keyed on the normalised query or
// barcode, so "banana" searched by a thousand members costs one lookup.
//
// Only signed-in members can trigger a lookup, so outsiders can't use up the
// USDA key's hourly quota or Open Food Facts' rate limits. The session token
// comes in X-Fikko-Session rather than Authorization, because Vercel's CDN won't
// cache requests that carry an Authorization header. Cached answers are served
// without the check, which is fine: they cost nothing and are public data.

import { admin, supabaseReady } from "./_lib/devices.js";

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

/** CDN caching: fresh for `seconds`, then a stale copy for up to a week while it refreshes. */
const cached = (seconds: number) => ({
  "Cache-Control": `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=604800`,
});

const USDA_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";
// Generic whole foods only; USDA's branded entries are noisy, and Open Food Facts covers brands.
const DATA_TYPES = "Foundation,SR Legacy";
const OFF_SEARCH_URL = "https://search.openfoodfacts.org/search";
const OFF_PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product";
// Open Food Facts asks every app to identify itself.
const OFF_HEADERS = { "User-Agent": "Fikko/1.0 (hello@fikko.io)" };
const OFF_FIELDS = "code,product_name,brands,nutriments,serving_quantity";
const MAX_QUERY_LENGTH = 60;
const BRANDED_RESULTS = 10;

export interface FoodSearchHit {
  id: string;
  name: string;
  brand?: string;
  caloriesPer100g: number;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  fatPer100g: number | null;
  /** Grams in one serving, when the product says. */
  servingGrams?: number;
  /** "generic" (USDA) or "branded" (Open Food Facts). */
  source: "generic" | "branded";
  barcode?: string;
}

/** Lower-case and collapse whitespace, so equivalent queries share a cache entry. */
export function normalizeQuery(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

const r1 = (n: number) => Math.round(n * 10) / 10;

// ── USDA ───────────────────────────────────────────────────────────────────

interface UsdaFood {
  fdcId: number;
  description: string;
  foodNutrients?: { nutrientName: string; unitName: string; value: number }[];
}

async function searchUsda(query: string): Promise<FoodSearchHit[]> {
  // USDA_API_KEY is the server-only name. VITE_USDA_API_KEY is accepted as a
  // fallback so the existing Vercel variable keeps working during the switch.
  const apiKey = process.env.USDA_API_KEY ?? process.env.VITE_USDA_API_KEY;
  if (!apiKey) throw new Error("not configured");
  const url = new URL(USDA_URL);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("query", query);
  url.searchParams.set("pageSize", "25");
  url.searchParams.set("dataType", DATA_TYPES);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`USDA ${res.status}`);

  const data = (await res.json()) as { foods?: UsdaFood[] };
  const foods: FoodSearchHit[] = [];
  for (const food of data.foods ?? []) {
    const energy = food.foodNutrients?.find((n) => n.nutrientName === "Energy" && n.unitName?.toUpperCase() === "KCAL");
    if (!energy) continue;
    // Grams per 100 g, or null when USDA doesn't list it for this food.
    const grams = (name: string) => {
      const n = food.foodNutrients?.find((x) => x.nutrientName === name && x.unitName?.toUpperCase() === "G");
      return n ? r1(n.value) : null;
    };
    foods.push({
      id: `usda-${food.fdcId}`,
      name: food.description,
      caloriesPer100g: energy.value,
      proteinPer100g: grams("Protein"),
      carbsPer100g: grams("Carbohydrate, by difference"),
      fatPer100g: grams("Total lipid (fat)"),
      source: "generic",
    });
  }
  return foods;
}

// ── Open Food Facts ────────────────────────────────────────────────────────

interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string | string[];
  nutriments?: Record<string, number | string | undefined>;
  serving_quantity?: number | string;
}

/** A product as a search hit, or null when it has no name or no calories per 100 g. */
function fromOff(p: OffProduct): FoodSearchHit | null {
  const name = p.product_name?.trim();
  const n = p.nutriments ?? {};
  const num = (k: string) => (n[k] == null || n[k] === "" ? null : Number(n[k]));
  let kcal = num("energy-kcal_100g");
  // Some products only list kilojoules.
  if (kcal == null && num("energy-kj_100g") != null) kcal = num("energy-kj_100g")! / 4.184;
  if (!name || kcal == null || !Number.isFinite(kcal) || kcal < 0 || kcal > 900) return null;
  const macro = (k: string) => { const v = num(k); return v == null || !Number.isFinite(v) ? null : r1(Math.min(100, Math.max(0, v))); };
  const brand = Array.isArray(p.brands) ? p.brands[0] : p.brands?.split(",")[0];
  const serving = Number(p.serving_quantity);
  return {
    id: `off-${p.code ?? name}`,
    name,
    brand: brand?.trim() || undefined,
    caloriesPer100g: r1(kcal),
    proteinPer100g: macro("proteins_100g"),
    carbsPer100g: macro("carbohydrates_100g"),
    fatPer100g: macro("fat_100g"),
    servingGrams: Number.isFinite(serving) && serving > 0 && serving <= 2000 ? r1(serving) : undefined,
    source: "branded",
    barcode: p.code,
  };
}

async function searchBranded(query: string): Promise<FoodSearchHit[]> {
  const url = new URL(OFF_SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("page_size", "24");
  url.searchParams.set("fields", OFF_FIELDS);
  url.searchParams.set("langs", "en");
  const res = await fetch(url, { headers: OFF_HEADERS, signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`Open Food Facts ${res.status}`);
  const data = (await res.json()) as { hits?: OffProduct[] };
  const seen = new Set<string>();
  const out: FoodSearchHit[] = [];
  for (const p of data.hits ?? []) {
    const hit = fromOff(p);
    if (!hit) continue;
    const key = `${hit.brand ?? ""}|${hit.name}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
    if (out.length >= BRANDED_RESULTS) break;
  }
  return out;
}

async function lookupBarcode(code: string): Promise<FoodSearchHit | null> {
  const res = await fetch(`${OFF_PRODUCT_URL}/${code}.json?fields=${OFF_FIELDS}`, { headers: OFF_HEADERS, signal: AbortSignal.timeout(6000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Food Facts ${res.status}`);
  const data = (await res.json()) as { status?: number; product?: OffProduct };
  if (!data.product || data.status === 0) return null;
  return fromOff({ ...data.product, code: data.product.code ?? code });
}

// ── Endpoint ───────────────────────────────────────────────────────────────

async function signedIn(request: Request) {
  const token = request.headers.get("x-fikko-session");
  if (!token || !supabaseReady()) return false;
  const { data, error } = await admin().auth.getUser(token);
  return !error && !!data.user;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const barcode = params.get("barcode")?.trim();

  if (barcode != null) {
    if (!/^\d{8,14}$/.test(barcode)) return json({ error: "That doesn't look like a barcode." }, 400);
    if (!(await signedIn(request))) return json({ error: "Sign in to look up foods." }, 401);
    try {
      const food = await lookupBarcode(barcode);
      // Unknown products get added to Open Food Facts over time, so re-check those sooner.
      return json({ food }, 200, cached(food ? 86400 : 3600));
    } catch {
      return json({ error: "Barcode lookup is unavailable right now. Try searching by name." }, 502);
    }
  }

  const query = normalizeQuery(params.get("q") ?? "");
  if (!query) return json({ error: "Enter a food to search for." }, 400);
  if (query.length > MAX_QUERY_LENGTH) return json({ error: "That search is too long." }, 400);
  if (!(await signedIn(request))) return json({ error: "Sign in to search foods." }, 401);

  const [generic, branded] = await Promise.allSettled([searchUsda(query), searchBranded(query)]);
  if (generic.status === "rejected" && branded.status === "rejected") {
    return json({ error: "Food search is unavailable right now." }, 502);
  }
  const foods = [
    ...(generic.status === "fulfilled" ? generic.value : []),
    ...(branded.status === "fulfilled" ? branded.value : []),
  ];
  // A partial answer is cached only briefly, so the missing half is retried soon.
  const complete = generic.status === "fulfilled" && branded.status === "fulfilled";
  return json({ foods }, 200, cached(complete ? 86400 : 600));
}

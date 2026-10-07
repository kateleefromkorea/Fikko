// Food search for the meal log, from two databases:
//   • USDA FoodData Central for generic whole foods ("banana", "chicken breast").
//     The key stays on the server.
//   • Open Food Facts for branded, packaged products and barcode lookups.
//   • Regional food composition databases (Australia's AFCD, and more as they're
//     licensed) from the regional_foods table, shown with the generic foods.
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
//
// Lookups that do reach the server are rate limited per member (see
// SEARCH_LIMITS), so one account can't use up the USDA key's hourly quota.

import { admin, supabaseReady } from "./_lib/devices.js";
import { lookupBarcode, normalizeQuery, searchBranded, searchRegional, searchUsda } from "./_lib/foods.js";
import { OPTIONS, withCors } from "./_lib/cors.js";
import { SLOW_DOWN, withinLimits } from "./_lib/rateLimit.js";

export type { FoodSearchHit } from "./_lib/foods.js";

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

const MAX_QUERY_LENGTH = 60;
/** Uncached lookups per member: 40 a minute, 400 an hour. Far more than logging a day's meals needs. */
const SEARCH_LIMITS: [number, number][] = [[40, 60], [400, 3600]];

// ── Endpoint ───────────────────────────────────────────────────────────────

/** null when the lookup may go ahead, otherwise the reply to send. */
async function refuse(request: Request, signInMessage: string) {
  const token = request.headers.get("x-fikko-session");
  if (!token || !supabaseReady()) return json({ error: signInMessage }, 401);
  const db = admin();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return json({ error: signInMessage }, 401);
  if (!(await withinLimits(db, `food:${data.user.id}`, SEARCH_LIMITS))) return json({ error: SLOW_DOWN }, 429);
  return null;
}

async function handleGET(request: Request) {
  const params = new URL(request.url).searchParams;
  const barcode = params.get("barcode")?.trim();

  if (barcode != null) {
    if (!/^\d{8,14}$/.test(barcode)) return json({ error: "That doesn't look like a barcode." }, 400);
    const refused = await refuse(request, "Sign in to look up foods.");
    if (refused) return refused;
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
  const refused = await refuse(request, "Sign in to search foods.");
  if (refused) return refused;

  const [generic, branded, regional] = await Promise.allSettled([searchUsda(query), searchBranded(query), searchRegional(query)]);
  // The regional databases are an extra: if the table isn't there yet, search carries on without them.
  const regionalFoods = regional.status === "fulfilled" ? regional.value : [];
  if (generic.status === "rejected" && branded.status === "rejected" && !regionalFoods.length) {
    return json({ error: "Food search is unavailable right now." }, 502);
  }
  const foods = [
    ...(generic.status === "fulfilled" ? generic.value : []),
    ...regionalFoods,
    ...(branded.status === "fulfilled" ? branded.value : []),
  ];
  // A partial answer is cached only briefly, so the missing half is retried soon.
  const complete = generic.status === "fulfilled" && branded.status === "fulfilled";
  return json({ foods }, 200, cached(complete ? 86400 : 600));
}

// The mobile apps call these from another origin (see _lib/cors.ts).
export const GET = withCors(handleGET);
export { OPTIONS };

// Helpers for searching the regional food tables (Australia's AFCD and others).
// Pure, so they can be tested without a database.
//
// AFCD names foods the Australian way, so a plain word match misses a query
// that uses another everyday name for the same thing ("yogurt" for "yoghurt",
// "bell pepper" for "capsicum", "shrimp" for "prawn").

/** [what a member might type, what the regional databases call it]. Whole words only. */
const SYNONYMS: [RegExp, string][] = [
  [/\byogurts?\b/g, "yoghurt"],
  [/\bweet ?bix\b/g, "weet-bix"],
  [/\bbell peppers?\b/g, "capsicum"],
  [/\bcilantro\b/g, "coriander"],
  [/\barugula\b/g, "rocket"],
  [/\bscallions?\b/g, "spring onion"],
  [/\bgreen onions?\b/g, "spring onion"],
  [/\bshrimps?\b/g, "prawn"],
  [/\bground beef\b/g, "beef mince"],
  [/\bcookies?\b/g, "biscuit"],
  [/\bdonuts?\b/g, "doughnut"],
  [/\bgarbanzo( beans?)?\b/g, "chickpea"],
  [/\bchili\b/g, "chilli"],
  [/\bcourgettes?\b/g, "zucchini"],
  [/\baubergines?\b/g, "eggplant"],
  [/\brutabaga\b/g, "swede"],
  [/\bsnags?\b/g, "sausage"],
  [/\bavo\b/g, "avocado"],
  [/\bfrench fries\b/g, "chips"],
];

/** The query itself, then up to two rewrites using the names the regional databases use. */
export function queryVariants(query: string, max = 3): string[] {
  const base = query.trim().toLowerCase().replace(/\s+/g, " ");
  const out = [base];
  for (const [pattern, replacement] of SYNONYMS) {
    if (out.length >= max) break;
    const next = base.replace(pattern, replacement);
    if (next !== base && !out.includes(next)) out.push(next);
  }
  return out;
}

/**
 * How well a food's name matches what was typed, lower is better:
 * 0 the food is exactly the query, 1 its first part starts with the query,
 * 2 the name contains the query as a phrase, 3 it only contains every word.
 * The phrase tier puts "Coffee, flat white/latte" above "Bread, flat (pita), white"
 * for "flat white".
 */
export function matchTier(name: string, localName: string | null, query: string) {
  const lower = query.toLowerCase();
  const n = name.toLowerCase();
  const first = n.split(",")[0].trim();
  if (first === lower || localName === query) return 0;
  if (first.startsWith(lower)) return 1;
  if (n.includes(lower) || (localName ?? "").toLowerCase().includes(lower)) return 2;
  return 3;
}

// Stage 1 of the pipeline: the recipe as the page describes it for search
// engines. Most recipe sites and blogs (WordPress recipe plugins, Yoast, big
// publishers, Cookpad, Kurashiru, 만개의레시피) publish a schema.org Recipe as
// JSON-LD; some older ones use microdata. Both are read into one plain object
// and mapped onto ImportedRecipe the same way.

import { parse, type HTMLElement } from "node-html-parser";
import { groupHeading, parseIngredient, type Ingredient } from "./ingredients.js";
import type { ImportedRecipe, ImportStage, PageExtraction } from "./types.js";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type Node = { [key: string]: Json };

const isNode = (v: unknown): v is Node => !!v && typeof v === "object" && !Array.isArray(v);
const list = (v: Json | undefined): Json[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

// ── Text helpers ───────────────────────────────────────────────────────────

/** HTML and entities out, whitespace collapsed. Some sites double-encode, so decode twice when needed. */
export function plain(value: string): string {
  let text = value;
  for (let i = 0; i < 2 && /<[a-z/!]|&(#\d+|#x[0-9a-f]+|[a-z]+);/i.test(text); i++) {
    text = parse(`<div>${text.replace(/<br\s*\/?>/gi, "\n")}</div>`).text;
  }
  return text.replace(/[ \t 　]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

const oneLine = (s: string) => plain(s).replace(/\s+/g, " ").trim();

/** A readable string from a JSON-LD value: text, a number, or a node's name. */
function str(v: Json | undefined): string | null {
  for (const item of list(v)) {
    if (typeof item === "string" && item.trim()) return oneLine(item);
    if (typeof item === "number") return String(item);
    if (isNode(item)) {
      const inner = str(item.name ?? item.text ?? item["@value"]);
      if (inner) return inner;
    }
  }
  return null;
}

function clip(text: string, max: number) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${space > max * 0.6 ? cut.slice(0, space) : cut}…`;
}

// ── Values ─────────────────────────────────────────────────────────────────

/** ISO 8601 durations ("PT1H30M", "P0DT0H20M") and loose ones ("1 hr 20 mins", "20分", "30분") → minutes. */
export function minutes(v: Json | undefined): number | null {
  const text = str(v);
  if (!text) return null;
  const iso = text.match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
  let total: number | null = null;
  if (iso && /\d/.test(text)) {
    const [, d, h, m, s] = iso.map((x) => (x ? Number(x) : 0)) as number[];
    total = d * 1440 + h * 60 + m + s / 60;
  } else {
    const h = text.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours|時間|시간)/i);
    const m = text.match(/(\d+)\s*(?:m|min|mins|minute|minutes|分|분)/i);
    if (h || m) total = (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
    else if (/^\d+$/.test(text)) total = Number(text);
  }
  if (total == null || !Number.isFinite(total)) return null;
  const rounded = Math.round(total);
  return rounded >= 0 && rounded <= 1440 ? rounded : null;
}

/** "4", "4 servings", ["4", "4 servings"], "Serves 4-6", "2人分", "4인분" → 4. */
export function servings(v: Json | undefined): number | null {
  for (const item of list(v)) {
    const text = typeof item === "number" ? String(item) : str(item);
    const n = text?.match(/\d+/)?.[0];
    if (n && Number(n) >= 1 && Number(n) <= 50) return Number(n);
  }
  return null;
}

function absoluteUrl(value: string | null, base: URL): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim(), base);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** image: a URL, a list of them, an ImageObject, or a list of those. */
function image(v: Json | undefined, base: URL): string | null {
  for (const item of list(v)) {
    if (typeof item === "string") {
      const url = absoluteUrl(item, base);
      if (url) return url;
    } else if (isNode(item)) {
      const url = absoluteUrl(str(item.url) ?? str(item.contentUrl), base);
      if (url) return url;
    }
  }
  return null;
}

function author(v: Json | undefined): string | null {
  const names = list(v).map((a) => (typeof a === "string" ? oneLine(a) : isNode(a) ? str(a.name) : null)).filter((n): n is string => !!n);
  return names.length ? clip([...new Set(names)].join(", "), 200) : null;
}

const grams = (v: Json | undefined) => {
  const text = str(v);
  if (!text || /\bmg\b/i.test(text)) return null;
  const n = Number(text.replace(",", ".").match(/\d+(?:\.\d+)?/)?.[0]);
  return Number.isFinite(n) && n >= 0 && n <= 1000 ? Math.round(n * 10) / 10 : null;
};

function nutrition(v: Json | undefined): ImportedRecipe["nutrition"] {
  const n = list(v).find(isNode);
  if (!n) return null;
  let calories: number | null = null;
  const kcal = str(n.calories);
  if (kcal) {
    const value = Number(kcal.replace(",", ".").match(/\d+(?:\.\d+)?/)?.[0]);
    if (Number.isFinite(value)) calories = Math.round(/kj/i.test(kcal) && !/kcal/i.test(kcal) ? value / 4.184 : value);
    if (calories != null && (calories < 0 || calories > 5000)) calories = null;
  }
  const out = { calories, protein: grams(n.proteinContent), carbs: grams(n.carbohydrateContent), fat: grams(n.fatContent) };
  return Object.values(out).some((x) => x != null) ? out : null;
}

// ── Ingredients and steps ──────────────────────────────────────────────────

function ingredients(v: Json | undefined): Ingredient[] {
  const lines = list(v).flatMap((item) => {
    const text = typeof item === "string" ? plain(item) : str(item) ?? "";
    return text.split("\n");
  });
  const out: Ingredient[] = [];
  let group: string | null = null;
  for (const line of lines.map((l) => l.trim()).filter(Boolean)) {
    const heading = groupHeading(line);
    if (heading) { group = heading; continue; }
    out.push(parseIngredient(line, group));
  }
  return out;
}

const NUMBERING = /^(?:(?:step|ステップ|단계)\s*\d+\s*[.):：]?|\d+\s*[.)、:：]|[①-⑳❶-❿])\s*/i;
const cleanStep = (s: string) => oneLine(s).replace(NUMBERING, "").trim();

/** recipeInstructions in every shape seen in the wild. */
function steps(v: Json | undefined, out: string[] = [], section: string | null = null): string[] {
  let first = true;
  const push = (text: string) => {
    const step = cleanStep(text);
    if (!step) return;
    out.push(section && first ? `${section}: ${step}` : step);
    first = false;
  };
  for (const item of list(v)) {
    if (typeof item === "string") {
      const html = /<(li|p|br)\b/i.test(item);
      if (html) {
        const root = parse(item);
        const parts = root.querySelectorAll("li").length ? root.querySelectorAll("li") : root.querySelectorAll("p");
        if (parts.length) { parts.forEach((p) => push(p.text)); continue; }
      }
      const text = plain(item);
      const lines = text.split("\n").filter((l) => l.trim());
      // One paragraph numbered inline: "1. Heat oil. 2. Add onions."
      const inline = lines.length === 1 ? lines[0].split(/\s(?=\d{1,2}\.\s)/) : lines;
      inline.forEach(push);
    } else if (isNode(item)) {
      const type = list(item["@type"]).map(String).join(" ");
      if (/HowToSection/i.test(type) || (item.itemListElement && !/HowToStep/i.test(type))) {
        const name = str(item.name)?.replace(/[\s:：]+$/, "") || null;
        steps(item.itemListElement ?? item.steps ?? null, out, /HowToSection/i.test(type) ? name : section);
      } else {
        const text = str(item.text) ?? str(item.description) ?? str(item.name);
        if (text) push(text);
        if (item.itemListElement) steps(item.itemListElement, out, section);
      }
    }
  }
  return out;
}

// ── Tags ───────────────────────────────────────────────────────────────────

// Kept in step with src/lib/recipes.ts RecipeTag. Meat and fish tags matter:
// they're how a vegetarian member is warned (recipeClash in preferences.ts).
const MEAT: [string, RegExp][] = [
  ["chicken", /\bchicken\b|鶏|とり肉|鳥肉|ささみ|手羽|닭/i],
  ["beef", /\bbeef\b|\bsteak\b|\bmince\b|牛肉|牛こま|牛ひき|소고기|쇠고기|한우|차돌/i],
  ["pork", /\bpork\b|\bbacon\b|\bham\b|\bprosciutto\b|\bchorizo\b|\bpancetta\b|豚|ベーコン|ハム|돼지|삼겹|베이컨|햄/i],
  ["fish", /\bfish\b|\bsalmon\b|\btuna\b|\bcod\b|\bprawns?\b|\bshrimps?\b|\banchov|\bsardines?\b|\bmackerel\b|\bsquid\b|鮭|さけ|サーモン|まぐろ|ツナ|えび|エビ|海老|魚|いか|イカ|たこ|생선|연어|참치|새우|멸치|오징어|고등어|어묵/i],
  ["eggs", /\beggs?\b|卵|たまご|玉子|계란|달걀/i],
];

function tags(node: Node, items: Ingredient[], total: number | null): string[] {
  const words = [
    ...list(node.keywords).flatMap((k) => (typeof k === "string" ? k.split(/[,、]/) : [])),
    ...list(node.recipeCategory).map((x) => str(x) ?? ""),
    ...list(node.suitableForDiet).map((x) => str(x) ?? ""),
  ].join(" | ").toLowerCase();
  const names = items.map((i) => `${i.name} ${i.raw_text}`).join(" | ");

  const out = new Set<string>();
  for (const [tag, re] of MEAT) if (re.test(names)) out.add(tag);
  const meaty = ["chicken", "beef", "pork", "fish"].some((t) => out.has(t));
  if (!meaty && /vegetarian|ベジタリアン|채식/.test(words)) out.add("vegetarian");
  if (!meaty && !out.has("eggs") && /vegan|ヴィーガン|비건/.test(words)) out.add("vegan");
  if (/low.?fat|lowfatdiet/.test(words)) out.add("low-fat");
  if (/low.?carb|keto|lowcarb|糖質オフ|저탄/.test(words)) out.add("low-carb");
  if (/high.?protein|高たんぱく|고단백/.test(words)) out.add("high-protein");
  if (/breakfast|朝ごはん|朝食|아침/.test(words)) out.add("breakfast");
  if (total != null && total > 0 && total <= 20) out.add("quick");
  return [...out];
}

// ── Language ───────────────────────────────────────────────────────────────

export function detectLanguage(declared: string | null, sample: string): string | null {
  const code = declared?.trim().toLowerCase().split(/[-_]/)[0];
  if (code && /^[a-z]{2,3}$/.test(code)) return code;
  if (/[가-힯]/.test(sample)) return "ko";
  if (/[぀-ヿ]/.test(sample)) return "ja";
  if (/[一-鿿]/.test(sample)) return "zh";
  if (/[a-z]/i.test(sample)) return "en";
  return null;
}

// ── Finding the Recipe node ────────────────────────────────────────────────

const isRecipeType = (t: Json | undefined) => list(t).some((x) => typeof x === "string" && /(^|[/:#])Recipe$/i.test(x.trim()));

/** Every Recipe node in a JSON-LD document, with @id references resolvable. */
function findRecipes(doc: Json): { recipes: Node[]; byId: Map<string, Node> } {
  const recipes: Node[] = [];
  const byId = new Map<string, Node>();
  const walk = (v: Json, depth: number) => {
    if (depth > 12) return;
    if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1));
    if (!isNode(v)) return;
    if (typeof v["@id"] === "string" && Object.keys(v).length > 1) byId.set(v["@id"], v);
    if (isRecipeType(v["@type"])) recipes.push(v);
    for (const [key, child] of Object.entries(v)) if (key !== "@context") walk(child, depth + 1);
  };
  walk(doc, 0);
  return { recipes, byId };
}

/** Replaces {"@id": "..."} stubs (common in Yoast graphs) with the node they point to. */
function deref(v: Json | undefined, byId: Map<string, Node>): Json | undefined {
  if (Array.isArray(v)) return v.map((x) => deref(x, byId) ?? null);
  if (isNode(v) && typeof v["@id"] === "string" && Object.keys(v).length === 1) return byId.get(v["@id"]) ?? v;
  return v;
}

/** Raw tabs and newlines inside JSON strings are invalid but common; escape them there only. */
function escapeControlChars(text: string) {
  let out = "", inString = false, escaped = false;
  for (const ch of text) {
    if (inString && !escaped && ch < " ") {
      out += ch === "\n" ? "\\n" : ch === "\t" ? "\\t" : ch === "\r" ? "" : " ";
      continue;
    }
    if (ch === '"' && !escaped) inString = !inString;
    escaped = inString && !escaped && ch === "\\";
    out += ch;
  }
  return out;
}

/** Parses JSON-LD as sites actually write it: CDATA wrappers, comments, raw newlines in strings. */
export function parseJsonLd(raw: string): Json | null {
  const text = raw.trim()
    .replace(/^\s*(?:\/\/\s*)?<!\[CDATA\[/, "").replace(/(?:\/\/\s*)?\]\]>\s*$/, "")
    .replace(/^\s*<!--/, "").replace(/-->\s*$/, "").trim();
  for (const candidate of [text, escapeControlChars(text)]) {
    try {
      return JSON.parse(candidate) as Json;
    } catch {
      // Try the next clean-up.
    }
  }
  return null;
}

// ── Microdata ──────────────────────────────────────────────────────────────

function microValue(el: HTMLElement): string {
  const tag = el.tagName?.toLowerCase();
  const attr = el.getAttribute("content") ?? (tag === "time" ? el.getAttribute("datetime") : undefined)
    ?? (tag === "img" ? el.getAttribute("src") : undefined) ?? (tag === "a" || tag === "link" ? el.getAttribute("href") : undefined)
    ?? (tag === "meta" ? el.getAttribute("content") : undefined);
  return attr ?? el.text;
}

/** A schema.org Recipe in microdata, read into the same shape as JSON-LD. */
function microdataRecipe(root: HTMLElement): Node | null {
  const scope = root.querySelectorAll("[itemscope][itemtype]").find((el) => isRecipeType(el.getAttribute("itemtype") ?? ""));
  if (!scope) return null;
  const node: Node = { "@type": "Recipe" };
  const add = (key: string, value: Json) => {
    const prev = node[key];
    node[key] = prev == null ? value : [...list(prev), value];
  };
  for (const el of scope.querySelectorAll("[itemprop]")) {
    for (const prop of (el.getAttribute("itemprop") ?? "").split(/\s+/)) {
      switch (prop) {
        case "recipeInstructions": {
          const items = el.querySelectorAll("li");
          if (items.length) items.forEach((li) => add(prop, li.text));
          else add(prop, el.innerHTML);
          break;
        }
        case "author":
          add(prop, el.querySelector("[itemprop=name]")?.text ?? el.text);
          break;
        case "nutrition":
          node.nutrition = {
            calories: el.querySelector("[itemprop=calories]")?.text ?? null,
            proteinContent: el.querySelector("[itemprop=proteinContent]")?.text ?? null,
            carbohydrateContent: el.querySelector("[itemprop=carbohydrateContent]")?.text ?? null,
            fatContent: el.querySelector("[itemprop=fatContent]")?.text ?? null,
          };
          break;
        case "name": case "description": case "image": case "recipeIngredient": case "ingredients": case "recipeYield":
        case "prepTime": case "cookTime": case "totalTime": case "keywords": case "recipeCategory": case "inLanguage":
          // A name inside a nested item (author, step) isn't the recipe's.
          if (prop === "name" && el.closest("[itemscope]") !== scope) break;
          add(prop, microValue(el));
          break;
      }
    }
  }
  return node;
}

// ── Mapping ────────────────────────────────────────────────────────────────

const LIMIT = { title: 80, description: 300, ingredients: 80, steps: 50, step: 1200 };

/** One schema.org Recipe node → ImportedRecipe. */
export function mapRecipe(node: Node, page: URL, byId = new Map<string, Node>(), meta?: PageExtraction["meta"]): ImportedRecipe {
  const get = (key: string) => deref(node[key], byId);
  const prep = minutes(get("prepTime"));
  const cook = minutes(get("cookTime"));
  const totalRaw = minutes(get("totalTime"));
  const total = totalRaw || (prep != null || cook != null ? (prep ?? 0) + (cook ?? 0) || null : null);
  const items = ingredients(get("recipeIngredient") ?? get("ingredients")).slice(0, LIMIT.ingredients);
  const method = steps(get("recipeInstructions") ?? null).map((s) => clip(s, LIMIT.step)).slice(0, LIMIT.steps);
  const title = clip(str(get("name")) ?? meta?.title ?? "", LIMIT.title);
  const publisher = deref(node.publisher, byId);

  const recipe: ImportedRecipe = {
    title,
    description: clip(str(get("description")) ?? "", LIMIT.description),
    source_url: page.toString(),
    source_site: (isNode(publisher) ? str(publisher.name) : null) ?? meta?.site_name ?? page.hostname.replace(/^www\./, ""),
    author: author(get("author")),
    image_url: image(get("image") ?? get("thumbnailUrl"), page) ?? meta?.image_url ?? null,
    servings: servings(get("recipeYield") ?? get("yield")),
    prep_time_min: prep,
    cook_time_min: cook,
    total_time_min: total,
    ingredients: items,
    steps: method,
    tags: tags(node, items, total),
    nutrition: nutrition(get("nutrition")),
    language: detectLanguage(str(get("inLanguage")) ?? meta?.language ?? null, `${title} ${items.map((i) => i.raw_text).join(" ")}`),
    confidence: 0,
    missing_fields: [],
  };
  return score(recipe);
}

/** Works out missing_fields and a confidence from what the page gave. */
export function score(recipe: ImportedRecipe): ImportedRecipe {
  const missing: string[] = [];
  if (!recipe.title) missing.push("title");
  if (!recipe.ingredients.length) missing.push("ingredients");
  if (!recipe.steps.length) missing.push("steps");
  if (recipe.servings == null) missing.push("servings");
  if (recipe.total_time_min == null) missing.push("time");
  if (!recipe.image_url) missing.push("image");
  if (!recipe.description) missing.push("description");
  if (!recipe.nutrition?.calories) missing.push("calories");
  const unparsed = recipe.ingredients.filter((i) => i.quantity == null).length;
  let confidence = 1;
  if (missing.includes("title") || missing.includes("ingredients") || missing.includes("steps")) confidence = 0.2;
  else {
    confidence -= 0.05 * missing.length;
    // A recipe with one ingredient or one step is often a summary, not the real thing.
    if (recipe.ingredients.length < 2 || recipe.steps.length < 2) confidence -= 0.25;
    if (recipe.ingredients.length && unparsed / recipe.ingredients.length > 0.5) confidence -= 0.1;
  }
  return { ...recipe, missing_fields: missing, confidence: Math.max(0, Math.min(1, Math.round(confidence * 100) / 100)) };
}

/** True when a recipe has what the library needs to save it. */
export const isComplete = (r: ImportedRecipe | null): r is ImportedRecipe =>
  !!r && !!r.title && r.ingredients.length > 0 && r.steps.length > 0;

function pageMeta(root: HTMLElement): PageExtraction["meta"] {
  const metaContent = (sel: string) => root.querySelector(sel)?.getAttribute("content")?.trim() || null;
  return {
    title: metaContent('meta[property="og:title"]') ?? (root.querySelector("title")?.text.trim() || null),
    description: metaContent('meta[property="og:description"]') ?? metaContent('meta[name="description"]'),
    image_url: metaContent('meta[property="og:image"]') ?? metaContent('meta[name="twitter:image"]'),
    site_name: metaContent('meta[property="og:site_name"]'),
    language: root.querySelector("html")?.getAttribute("lang")?.trim() || null,
  };
}

/** Structured data first (JSON-LD, then microdata). Returns the best recipe found, if any. */
export function extractStructured(html: string, page: URL): PageExtraction {
  const root = parse(html, { blockTextElements: { script: true, style: false, noscript: false, pre: true } });
  const meta = pageMeta(root);
  if (meta.image_url) meta.image_url = absoluteUrl(meta.image_url, page);
  if (meta.title) meta.title = oneLine(meta.title);
  if (meta.description) meta.description = oneLine(meta.description);

  const candidates: { node: Node; byId: Map<string, Node>; stage: ImportStage }[] = [];
  for (const script of root.querySelectorAll("script")) {
    if ((script.getAttribute("type") ?? "").trim().toLowerCase() !== "application/ld+json") continue;
    const doc = parseJsonLd(script.rawText);
    if (doc == null) continue;
    const { recipes, byId } = findRecipes(doc);
    for (const node of recipes) candidates.push({ node, byId, stage: "json_ld" });
  }
  if (!candidates.length) {
    const micro = microdataRecipe(root);
    if (micro) candidates.push({ node: micro, byId: new Map(), stage: "microdata" });
  }
  if (!candidates.length) return { recipe: null, stage: null, meta };

  // Pages with several (a roundup, or a recipe plus "you might also like")
  // usually have the main one first; prefer the fullest complete one.
  const mapped = candidates.map((c) => ({ ...c, recipe: mapRecipe(c.node, page, c.byId, meta) }));
  mapped.sort((a, b) => Number(isComplete(b.recipe)) - Number(isComplete(a.recipe)) || b.recipe.confidence - a.recipe.confidence);
  return { recipe: mapped[0].recipe, stage: mapped[0].stage, meta };
}

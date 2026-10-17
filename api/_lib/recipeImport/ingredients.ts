// Ingredient lines as recipe pages write them ("2 cups flour, sifted",
// "醤油 大さじ2", "양파 1/2개") turned into structured parts, with amounts
// converted to metric where that's unambiguous. raw_text always keeps the
// line exactly as written, so nothing is lost when a line can't be parsed:
// quantity and unit are then simply null.

export interface Ingredient {
  raw_text: string;
  quantity: number | null;
  unit: string | null;
  name: string;
  notes: string | null;
  group: string | null;
}

const FRACTIONS: Record<string, string> = {
  "½": " 1/2", "⅓": " 1/3", "⅔": " 2/3", "¼": " 1/4", "¾": " 3/4", "⅕": " 1/5", "⅛": " 1/8", "⅜": " 3/8", "⅝": " 5/8", "⅞": " 7/8",
  "⁄": "/",
};

/** Unit spellings → [canonical unit, factor to the metric unit, metric unit]. Factor null: a count, not converted. */
type UnitDef = [canonical: string, factor: number | null, metric: "g" | "ml" | null];
const UNITS: [RegExp, UnitDef][] = [
  [/^(?:g|grams?|gr|grammes?)$/i, ["g", 1, "g"]],
  [/^(?:kg|kilos?|kilograms?)$/i, ["kg", 1000, "g"]],
  [/^(?:mg|milligrams?)$/i, ["mg", 0.001, "g"]],
  [/^(?:oz|ounces?)$/i, ["oz", 28.35, "g"]],
  [/^(?:lbs?|pounds?)$/i, ["lb", 453.6, "g"]],
  [/^(?:ml|millilitres?|milliliters?|cc)$/i, ["ml", 1, "ml"]],
  [/^(?:l|litres?|liters?|ltrs?)$/i, ["l", 1000, "ml"]],
  [/^(?:dl|decilitres?|deciliters?)$/i, ["dl", 100, "ml"]],
  [/^(?:cl|centilitres?|centiliters?)$/i, ["cl", 10, "ml"]],
  [/^(?:tsps?|teaspoons?|t)$/, ["tsp", 5, "ml"]],
  [/^(?:tsps?|teaspoons?)$/i, ["tsp", 5, "ml"]],
  [/^(?:tbsps?|tbs|tbl|tablespoons?|T)$/, ["tbsp", 15, "ml"]],
  [/^(?:tbsps?|tbs|tablespoons?)$/i, ["tbsp", 15, "ml"]],
  [/^(?:cups?|c)$/i, ["cup", 240, "ml"]],
  [/^(?:fl\.? ?oz|fluid ounces?)$/i, ["fl oz", 29.57, "ml"]],
  [/^(?:pints?|pt)$/i, ["pint", 473, "ml"]],
  [/^(?:quarts?|qt)$/i, ["quart", 946, "ml"]],
  [/^(?:cloves?)$/i, ["clove", null, null]],
  [/^(?:pinch(?:es)?)$/i, ["pinch", null, null]],
  [/^(?:dash(?:es)?)$/i, ["dash", null, null]],
  [/^(?:handfuls?)$/i, ["handful", null, null]],
  [/^(?:bunch(?:es)?)$/i, ["bunch", null, null]],
  [/^(?:cans?|tins?)$/i, ["can", null, null]],
  [/^(?:slices?)$/i, ["slice", null, null]],
  [/^(?:pieces?|pcs?)$/i, ["piece", null, null]],
  [/^(?:sticks?)$/i, ["stick", null, null]],
  [/^(?:packets?|packs?|packages?|pkgs?)$/i, ["pack", null, null]],
  [/^(?:sprigs?)$/i, ["sprig", null, null]],
  [/^(?:stalks?)$/i, ["stalk", null, null]],
  [/^(?:heads?)$/i, ["head", null, null]],
  [/^(?:sheets?)$/i, ["sheet", null, null]],
  // Japanese and Korean. Their cup is 200 ml; 合 is the rice cup (180 ml).
  [/^(?:大さじ|大匙|큰술|큰스푼|밥숟가락|숟가락|스푼)$/, ["tbsp", 15, "ml"]],
  [/^(?:小さじ|小匙|작은술|작은스푼|티스푼)$/, ["tsp", 5, "ml"]],
  [/^(?:カップ|컵)$/, ["cup", 200, "ml"]],
  [/^合$/, ["rice cup", 180, "ml"]],
  [/^(?:個|コ|ヶ|개)$/, ["piece", null, null]],
  [/^(?:本|대)$/, ["stalk", null, null]],
  [/^(?:枚|장)$/, ["sheet", null, null]],
  [/^(?:片|かけ|쪽|톨)$/, ["clove", null, null]],
  [/^(?:束|단)$/, ["bunch", null, null]],
  [/^(?:袋|봉지)$/, ["pack", null, null]],
  [/^(?:缶|캔)$/, ["can", null, null]],
  [/^(?:줌|つかみ)$/, ["handful", null, null]],
  [/^(?:마리|尾|匹)$/, ["whole", null, null]],
  [/^(?:丁|모)$/, ["block", null, null]],
];

function unitFor(word: string): UnitDef | null {
  const w = word.replace(/\.$/, "");
  for (const [re, def] of UNITS) if (re.test(w)) return def;
  return null;
}

/** "1 1/2", "1.5", "1,5", "3/4" → number. */
function toNumber(text: string): number | null {
  const t = text.trim().replace(",", ".");
  const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[2]) ? Number(frac[1]) / Number(frac[2]) : null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Mixed numbers and fractions first, so "1/2" isn't read as "1".
const NUM = String.raw`\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?`;
// "2", "1 1/2", "2-3", "2 to 3", "2〜3"
const QTY = new RegExp(String.raw`^(${NUM})(?:\s*(?:-|–|to|~|〜|～)\s*(?:${NUM}))?`, "i");
const QTY_END = new RegExp(String.raw`(${NUM})(?:\s*(?:-|–|~|〜|～)\s*(?:${NUM}))?$`);
const CJK = /[぀-ヿ㐀-鿿가-힯]/;
// Amounts like "to taste" that aren't a quantity.
const VAGUE = /^(?:少々|適量|適宜|お好みで|ひとつまみ|少量|약간|조금|적당량|적당히|기호에 따라|to taste|as needed|optional)$/i;

const round = (n: number) => (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10);

function convert(quantity: number | null, def: UnitDef | null): { quantity: number | null; unit: string | null } {
  if (quantity != null && !def) return { quantity: round(quantity), unit: null };
  if (!def) return { quantity, unit: null };
  const [canonical, factor, metric] = def;
  if (quantity == null || factor == null || metric == null) return { quantity: quantity == null ? null : round(quantity), unit: canonical };
  return { quantity: round(quantity * factor), unit: metric };
}

// What follows a comma when it's preparation, not part of the name:
// "chicken breasts, diced" but not "boneless, skin-on chicken thighs".
const PREP = /^(?:\w+ed|\w+ly|to taste|optional|divided|or\b|plus\b|about\b|at room|for\b|cut\b|such as|if\b|see\b|more\b|room temp)/i;
const tidy = (s: string) => s.replace(/^[\s,;:、]+|[\s,;:、]+$/g, "").replace(/\s+/g, " ").replace(/\s+([,;])/g, "$1");

/** Splits "chicken breasts, diced" and "flour (sifted)" into name and notes. */
function nameAndNotes(text: string): { name: string; notes: string | null } {
  let name = text.trim().replace(/^of\s+/i, "");
  const notes: string[] = [];
  // Innermost brackets first, so "((optional, Note 1))" comes out whole.
  for (let i = 0; i < 5 && /[(（][^()（）]*[)）]/.test(name); i++) {
    name = name.replace(/\s*[(（]([^()（）]*)[)）]\s*/g, (_, inner: string) => {
      if (tidy(inner)) notes.push(tidy(inner));
      return " ";
    });
  }
  name = name.replace(/[()（）]/g, " ").trim();
  const comma = name.search(/[,、]/);
  if (comma > 0 && PREP.test(name.slice(comma + 1).trim())) {
    notes.unshift(tidy(name.slice(comma + 1)));
    name = name.slice(0, comma);
  }
  return { name: tidy(name), notes: [...new Set(notes.filter(Boolean))].join("; ") || null };
}

/** "salt, to taste" style lines with no amount. */
function vagueTail(text: string) {
  const m = text.match(/^(.*?)[\s　,、:：・…]+(\S+(?:\s\S+)?)$/);
  return m && VAGUE.test(m[2].trim()) ? { name: m[1].trim(), notes: m[2].trim() } : null;
}

/** "大さじ2" / "2큰술" / "1/2個" at the end of a Japanese or Korean line. */
function parseCjk(text: string): Omit<Ingredient, "raw_text" | "group"> | null {
  const prefixUnit = text.match(new RegExp(String.raw`^(.*?)[\s　:：・…]*(大さじ|小さじ|大匙|小匙|カップ)\s*(${NUM})(?:\s*[~〜～-]\s*(?:${NUM}))?\s*$`));
  if (prefixUnit && prefixUnit[1].trim()) {
    const { name, notes } = nameAndNotes(prefixUnit[1]);
    return { name, notes, ...convert(toNumber(prefixUnit[3]), unitFor(prefixUnit[2])) };
  }
  const suffix = text.match(new RegExp(String.raw`^(.*?)[\s　:：・…]*(${NUM})(?:\s*[~〜～-]\s*(?:${NUM}))?\s*([^\d\s]{0,5})\s*$`));
  if (suffix && suffix[1].trim() && CJK.test(suffix[1])) {
    const def = suffix[3] ? unitFor(suffix[3]) : null;
    const { name, notes } = nameAndNotes(suffix[1]);
    // An unknown unit word ("2 인분") stays in the notes rather than being lost.
    const extra = suffix[3] && !def ? suffix[3] : null;
    return { name, notes: [notes, extra].filter(Boolean).join("; ") || null, ...convert(toNumber(suffix[2]), def) };
  }
  return null;
}

/**
 * Undoes what recipe plugins do to a line when they join its parts: WP
 * Recipe Maker writes notes as "(, sifted (Note 1))". The words are the
 * author's; only the stray punctuation goes.
 *   "flour (, bread or plain (Note 1))" → "flour (bread or plain, Note 1)"
 */
export function tidyLine(raw: string): string {
  let s = raw.trim().replace(/\s+/g, " ");
  for (let i = 0; i < 3; i++) {
    const before = s;
    s = s
      .replace(/\(\s*[,;:]\s*/g, "(") // "(, sifted" → "(sifted"
      .replace(/\(\(([^()]*)\)\)/g, "($1)") // "((Note 2))" → "(Note 2)"
      .replace(/\s+\(([^()]*)\)\)/g, ", $1)") // "(bread (Note 1))" → "(bread, Note 1)"
      .replace(/\s+\)/g, ")") // "(6oz )" → "(6oz)"
      .replace(/\(\s*\)/g, "") // "()"
      .replace(/\s{2,}/g, " ")
      .trim();
    if (s === before) break;
  }
  return s;
}

export function parseIngredient(raw: string, group: string | null = null): Ingredient {
  const raw_text = tidyLine(raw);
  let text = raw_text;
  for (const [from, to] of Object.entries(FRACTIONS)) text = text.split(from).join(to);
  // Full-width digits and symbols ("１／６", "～") to their plain forms.
  text = text.normalize("NFKC").replace(/\u2044/g, "/").replace(/\s+/g, " ").trim().replace(/^[-•*・]\s*/, "");

  // Amount first: "2 cups flour", "200g chicken", "1 1/2 tsp salt".
  const qty = text.match(QTY);
  if (qty) {
    const quantity = toNumber(qty[1]);
    let rest = text.slice(qty[0].length).trim();
    let def: UnitDef | null = null;
    const word = rest.match(/^([^\s\d,()（]+)\s*/);
    if (word) {
      def = unitFor(word[1]);
      if (!def && /^fl\.?$/i.test(word[1])) {
        const fl = rest.match(/^(fl\.?\s?oz\.?)\s*/i);
        if (fl) { def = unitFor("fl oz"); rest = rest.slice(fl[0].length); }
      } else if (def) {
        rest = rest.slice(word[0].length);
      }
    }
    // "3 cups (450g) flour": the author's own metric amount beats converting cups.
    const metric = rest.match(new RegExp(String.raw`^\(\s*(${NUM})\s*(g|grams?|kg|ml|millilitres?|milliliters?|l|litres?|liters?)\s*\)\s*`, "i"));
    if (metric) {
      const { name, notes } = nameAndNotes(rest.slice(metric[0].length));
      if (name) return { raw_text, group, name, notes, ...convert(toNumber(metric[1]), unitFor(metric[2])) };
    }
    const { name, notes } = nameAndNotes(rest);
    if (name) return { raw_text, group, name, notes, ...convert(quantity, def) };
  }

  // Name first, amount last: Japanese and Korean recipes.
  if (CJK.test(text)) {
    const cjk = parseCjk(text);
    if (cjk) return { raw_text, group, ...cjk };
  }

  const vague = vagueTail(text);
  if (vague) return { raw_text, group, name: vague.name, notes: vague.notes, quantity: null, unit: null };

  // An amount at the very end in other languages: "flour 200 g".
  const tail = text.match(new RegExp(String.raw`^(.+?)\s+${QTY_END.source.slice(0, -1)}\s*([^\d\s]{1,12})?$`));
  if (tail) {
    const def = tail[3] ? unitFor(tail[3]) : null;
    if (def || !tail[3]) {
      const { name, notes } = nameAndNotes(tail[1]);
      return { raw_text, group, name, notes, ...convert(toNumber(tail[2]), def) };
    }
  }

  const { name, notes } = nameAndNotes(text);
  return { raw_text, group, name: name || raw_text, notes, quantity: null, unit: null };
}

/** "For the sauce:" and similar lines that head a group rather than name an ingredient. */
export function groupHeading(line: string): string | null {
  const t = line.trim();
  if (t.length > 60 || /\d/.test(t)) return null;
  const m = t.match(/^(?:for (?:the )?)?(.+?)\s*[:：]$/i) ?? t.match(/^[【\[■◆●<〈《]\s*(.+?)\s*[】\]>〉》]?$/);
  return m ? m[1].trim() : null;
}

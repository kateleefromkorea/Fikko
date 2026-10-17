// The readable part of a page, for the AI stage: the recipe card or article,
// without navigation, ads, comments, sharing buttons and the like, as plain
// text with line breaks where the page had blocks and list items. Capped, so
// one huge page can't run up the AI bill.

import { parse, type HTMLElement } from "node-html-parser";

/** Roughly 6-10k tokens: enough for any recipe, small enough to keep costs predictable. */
export const MAX_CHARS = 20_000;
/** Less readable text than this means the page builds its content with JavaScript. */
export const MIN_CHARS = 200;

const DROP_TAGS = "script, style, noscript, template, svg, canvas, iframe, form, button, select, nav, header, footer, aside, dialog, video, audio, picture source";
// Class or id words that mark page furniture rather than content.
const NOISE = /(^|[\s_-])(comments?|respond|reply|sidebar|widget|related|recommend|share|sharing|social|newsletter|subscribe|signup|advert|ads?|adslot|sponsor|promo|banner|cookie|consent|popup|modal|breadcrumbs?|menu|navbar|footer|header|masthead|pagination|rating-form|jump-to)([\s_-]|$)/i;
// Where the recipe usually is, best first: recipe plugins, then the article.
const CONTENT = [
  ".wprm-recipe-container", ".tasty-recipes", ".mv-create-card", ".recipe-card", "[itemtype*=Recipe]",
  "article", "main", "[role=main]", "#content", ".content", ".post", ".entry-content",
];
const BLOCK = new Set(["p", "div", "section", "article", "main", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "table", "dl", "dt", "dd", "blockquote", "figure", "figcaption"]);

function clean(root: HTMLElement) {
  for (const el of root.querySelectorAll(DROP_TAGS)) el.remove();
  const total = root.text.length || 1;
  for (const el of root.querySelectorAll("[class], [id]")) {
    const label = `${el.getAttribute("class") ?? ""} ${el.getAttribute("id") ?? ""}`;
    if (!NOISE.test(label)) continue;
    // Never drop the recipe itself, even when it sits in a "widget", nor a
    // wrapper holding much of the page (layouts often tag those "has-ads").
    if (/recipe|ingredient|instruction|direction|method/i.test(label)) continue;
    if (el.text.length > total * 0.3 || el.querySelector("h1")) continue;
    el.remove();
  }
  for (const el of root.querySelectorAll("[hidden], [aria-hidden=true]")) el.remove();
}

/** Text with a line per block, "- " before list items and "## " before headings. */
function toText(el: HTMLElement): string {
  const out: string[] = [];
  const walk = (node: HTMLElement) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        out.push(child.text);
        continue;
      }
      if (child.nodeType !== 1) continue;
      const tag = (child as HTMLElement).tagName?.toLowerCase() ?? "";
      if (tag === "br") { out.push("\n"); continue; }
      if (BLOCK.has(tag)) out.push("\n");
      if (tag === "li") out.push("- ");
      if (/^h[1-6]$/.test(tag)) out.push("## ");
      walk(child as HTMLElement);
      if (BLOCK.has(tag)) out.push("\n");
    }
  };
  walk(el);
  return out.join("")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    // Empty list items (icons, spacers) leave bare markers behind.
    .replace(/^- ?$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface PageText {
  text: string;
  /** True when the page had more text than MAX_CHARS and was cut. */
  truncated: boolean;
}

export function mainText(html: string): PageText {
  const root = parse(html);
  // Read before cleaning: the title often sits in a <header>, which is dropped.
  const title = root.querySelector("h1")?.text.trim();
  clean(root);
  const body = root.querySelector("body") ?? root;
  // The first candidate with a real amount of text; tiny matches (an empty <main>) are skipped.
  let best: HTMLElement = body;
  for (const selector of CONTENT) {
    const el = body.querySelector(selector);
    if (el && el.text.trim().length >= MIN_CHARS) { best = el; break; }
  }
  let text = toText(best);
  if (title && !text.includes(title)) text = `## ${title}\n\n${text}`;
  const truncated = text.length > MAX_CHARS;
  return { text: truncated ? text.slice(0, MAX_CHARS) : text, truncated };
}

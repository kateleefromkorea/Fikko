// Recipe links as members paste them: often inside share text, sometimes
// without "https://", usually carrying tracking parameters. normalizeUrl turns
// that into the URL we fetch; sourceKey turns a URL into the key used to spot
// a recipe the member already has and to cache what a page gave us.

import net from "node:net";

export class InvalidUrlError extends Error {}

// Parameters that only say where a click came from. Dropped so the same page
// shared from Instagram and from a newsletter is one recipe, not two.
const TRACKING = new Set([
  "fbclid", "gclid", "gclsrc", "dclid", "gbraid", "wbraid", "msclkid", "yclid", "twclid", "ttclid", "li_fat_id",
  "mc_cid", "mc_eid", "igshid", "igsh", "si", "_ga", "_gl", "_hsenc", "_hsmi", "__hstc", "__hssc", "__hsfp",
  "hsctatracking", "mkt_tok", "oly_anon_id", "oly_enc_id", "vero_id", "wickedid", "ref", "ref_src", "ref_url",
  "spm", "scm", "cmpid", "s_cid", "ncid", "amp",
]);
const isTracking = (key: string) => {
  const k = key.toLowerCase();
  return k.startsWith("utm_") || TRACKING.has(k);
};

/** The first web address in what the member pasted, or the paste itself. */
function pickUrl(raw: string) {
  const text = raw.trim().replace(/^[<"'(]+|[>"')]+$/g, "");
  const found = text.match(/https?:\/\/[^\s<>"']+/i);
  if (found) return found[0].replace(/[.,;:!?)\]]+$/, "");
  // "example.com/recipe" with no scheme.
  if (/^[^\s/]+\.[^\s/]{2,}(\/\S*)?$/.test(text)) return `https://${text}`;
  return text;
}

/**
 * A clean URL to fetch: http or https only, no login details, no fragment and
 * no tracking parameters, remaining parameters sorted. Throws InvalidUrlError
 * with a message a member can act on.
 */
export function normalizeUrl(raw: string): URL {
  if (typeof raw !== "string" || !raw.trim()) throw new InvalidUrlError("Paste a link to a recipe page.");
  if (raw.length > 4000) throw new InvalidUrlError("That link is too long. Try copying it again from the address bar.");

  let url: URL;
  try {
    url = new URL(pickUrl(raw));
  } catch {
    throw new InvalidUrlError("That doesn't look like a web link. Copy the address of the recipe page and paste it here.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new InvalidUrlError("Only web links (http or https) can be imported.");
  }
  if (url.username || url.password) throw new InvalidUrlError("Links with a username or password can't be imported.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || (!host.includes(".") && !net.isIP(host))) {
    throw new InvalidUrlError("That link is missing its website. Copy the full address of the recipe page.");
  }

  url.hash = "";
  const kept = [...url.searchParams].filter(([key]) => !isTracking(key)).sort(([a], [b]) => a.localeCompare(b));
  url.search = new URLSearchParams(kept).toString();
  return url;
}

/**
 * The same page however it was linked: scheme and "www." ignored, host in
 * lower case, no trailing slash. Assumes `url` came from normalizeUrl.
 */
export function sourceKey(url: URL) {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const port = url.port ? `:${url.port}` : "";
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : "";
  return `${host}${port}${path}${url.search}`;
}

/** "bbcgoodfood.com" for showing where a recipe came from. */
export const siteName = (url: URL) => url.hostname.toLowerCase().replace(/^www\./, "");

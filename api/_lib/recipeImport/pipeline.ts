// The import pipeline: a URL in, an ImportedRecipe (or a clear reason why
// not) out. Each kind of source (only "web" in Phase 1) fetches and reads
// its pages its own way; everything after that is shared.

import { allowedByRobots, decodeHtml, FetchError, safeFetch } from "./safeFetch.js";
import { extractStructured, isComplete } from "./structured.js";
import type { ImportedRecipe, ImportStage, PageExtraction } from "./types.js";

/** Why an import didn't produce a recipe. The endpoint turns each into a message with a next step. */
export type FailureCode =
  | "invalid_url" | "blocked" | "robots" | "unreachable" | "timeout" | "too_large" | "not_html"
  | "login_required" | "not_found" | "no_recipe";

export class ImportFailure extends Error {
  constructor(public code: FailureCode, message: string, public partial: Partial<ImportedRecipe> | null = null) { super(message); }
}

export interface SourceResult {
  /** Where the page really was, after redirects. */
  finalUrl: URL;
  extraction: PageExtraction;
}

/**
 * One kind of place a recipe can come from. Instagram, TikTok or video
 * sources would each add one here, with their own fetching and reading.
 */
export interface RecipeSource {
  id: "web";
  handles(url: URL): boolean;
  extract(url: URL): Promise<SourceResult>;
}

const PAGE_LIMIT = { maxBytes: 4 * 1024 * 1024, timeoutMs: 7000 };

function failureFor(err: unknown): ImportFailure {
  if (err instanceof ImportFailure) return err;
  if (!(err instanceof FetchError)) return new ImportFailure("unreachable", "We couldn't open that page. Please try again.");
  switch (err.reason) {
    case "blocked": return new ImportFailure("blocked", err.message);
    case "timeout": return new ImportFailure("timeout", "That website took too long to respond. Try again in a moment.");
    case "too_large": return new ImportFailure("too_large", "That page is too large for us to read.");
    case "unsupported_type": return new ImportFailure("not_html", "That link isn't a web page. Paste the link to the recipe's page.");
    case "too_many_redirects": return new ImportFailure("unreachable", err.message);
    case "http_error":
      if (err.status === 401 || err.status === 402 || err.status === 403) {
        return new ImportFailure("login_required", "That website needs a sign-in or subscription, or doesn't let apps read its pages.");
      }
      if (err.status === 404 || err.status === 410) return new ImportFailure("not_found", "That page doesn't exist any more. Check the link.");
      return new ImportFailure("unreachable", "That website isn't working right now. Try again later.");
    default: return new ImportFailure("unreachable", err.message);
  }
}

export const webSource: RecipeSource = {
  id: "web",
  handles: (url) => url.protocol === "https:" || url.protocol === "http:",
  async extract(url) {
    try {
      if (!(await allowedByRobots(url))) {
        throw new ImportFailure("robots", "That website asks apps not to read its pages, so we can't import from it.");
      }
      const page = await safeFetch(url, {
        ...PAGE_LIMIT,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        allowTypes: /text\/html|application\/xhtml\+xml|^$/,
      });
      const html = decodeHtml(page.body, page.contentType);
      return { finalUrl: page.url, extraction: extractStructured(html, page.url) };
    } catch (err) {
      throw failureFor(err);
    }
  },
};

const SOURCES: RecipeSource[] = [webSource];

export interface PipelineResult {
  recipe: ImportedRecipe;
  stage: ImportStage;
  finalUrl: URL;
}

/** Runs the stages in order. Throws ImportFailure, with whatever was found as `partial`. */
export async function runPipeline(url: URL): Promise<PipelineResult> {
  const source = SOURCES.find((s) => s.handles(url));
  if (!source) throw new ImportFailure("invalid_url", "We can't import from that kind of link yet.");
  const { finalUrl, extraction } = await source.extract(url);

  if (isComplete(extraction.recipe) && extraction.stage) {
    return { recipe: extraction.recipe, stage: extraction.stage, finalUrl };
  }

  // Stage 2 (the AI reading the page) slots in here.

  const { recipe, meta } = extraction;
  const partial: Partial<ImportedRecipe> = {
    ...(recipe ?? {}),
    title: recipe?.title || meta.title || "",
    description: recipe?.description || meta.description || "",
    image_url: recipe?.image_url ?? meta.image_url,
    source_url: finalUrl.toString(),
    source_site: recipe?.source_site ?? meta.site_name ?? finalUrl.hostname.replace(/^www\./, ""),
  };
  throw new ImportFailure(
    "no_recipe",
    recipe
      ? "We found part of a recipe on that page but not all of it. You can fill in the rest yourself."
      : "We couldn't find a recipe on that page. It may load its recipe in a way we can't read yet.",
    partial,
  );
}

const IMAGE_TYPES = /^image\/(jpeg|png|webp|avif|gif)\b/;

/**
 * The recipe's photo as a data: URL, so the review form can show it (the
 * app's content security policy only allows our own images) and save it to
 * the member's photo folder. Null when there isn't one or it can't be fetched.
 */
export async function fetchImage(imageUrl: string | null): Promise<string | null> {
  if (!imageUrl) return null;
  try {
    const res = await safeFetch(new URL(imageUrl), { maxBytes: 3 * 1024 * 1024, timeoutMs: 4000, accept: "image/avif,image/webp,image/jpeg,image/png,image/*;q=0.8", allowTypes: IMAGE_TYPES });
    const type = res.contentType.match(IMAGE_TYPES)?.[0];
    return type ? `data:${type};base64,${res.body.toString("base64")}` : null;
  } catch {
    return null;
  }
}

// Import a recipe from a web page. The member pastes a link; we read the page
// and send back the recipe for them to check and save to their private
// library (ai_recipes, migration 044). Nothing is saved here.
//
//   POST { url: string, tzOffset?: number }  with "Authorization: Bearer <member session token>"
//
//   200 { recipe, stage, sourceKey, imageData }   recipe found; imageData is the photo as a data: URL, or null
//   200 { duplicate: { id, title } }              the member already has this page in their library
//   4xx { error, code, partial?, sourceUrl?, sourceKey? }   couldn't import; partial prefills the manual form
//
// Structured data (JSON-LD, microdata) is read first and costs nothing. Only a
// page without it goes to Claude, which needs the member's AI consent and uses
// one AI credit when it finds a recipe (none when it doesn't).
//
// Pages are fetched with the SSRF guards in _lib/recipeImport/safeFetch.ts. What
// a page gave us is cached by normalised URL (recipe_import_cache), so the same
// link is only read once. Logs record the stage, timing and outcome, never
// page contents or who asked.

import Anthropic from "@anthropic-ai/sdk";
import { admin, json, memberFrom, supabaseReady } from "./_lib/devices.js";
import { checkAllowance, clampOffset, limitMessage, recordUse } from "./_lib/aiUsage.js";
import { recordCosts } from "./_lib/aiCost.js";
import { consentError } from "./_lib/consent.js";
import { extractWithClaude, MODEL, type LlmInput } from "./_lib/recipeImport/llm.js";
import { isComplete } from "./_lib/recipeImport/structured.js";
import { OPTIONS, withCors } from "./_lib/cors.js";
import { SLOW_DOWN, withinLimits } from "./_lib/rateLimit.js";
import { InvalidUrlError, normalizeUrl, sourceKey, unsupportedSource } from "./_lib/recipeImport/url.js";
import { fetchImage, ImportFailure, runPipeline, type LlmOutcome } from "./_lib/recipeImport/pipeline.js";
import type { ImportedRecipe, ImportStage } from "./_lib/recipeImport/types.js";
import type { SupabaseClient } from "@supabase/supabase-js";

// A burst of a few links is normal (trying a couple of pages); scripts aren't.
const LIMITS: [number, number][] = [[6, 60], [60, 24 * 3600]];
const CACHE_DAYS = 30;

function log(fields: Record<string, unknown>) {
  console.log(JSON.stringify({ event: "recipe_import", ...fields }));
}

async function existing(db: SupabaseClient, userId: string, keys: string[]) {
  const { data } = await db.from("ai_recipes").select("id, title").eq("user_id", userId).in("source_key", keys).limit(1);
  return (data?.[0] as { id: string; title: string } | undefined) ?? null;
}

async function cached(db: SupabaseClient, key: string) {
  const since = new Date(Date.now() - CACHE_DAYS * 86_400_000).toISOString();
  const { data } = await db.from("recipe_import_cache").select("recipe, stage").eq("source_key", key).gte("created_at", since).maybeSingle();
  return (data as { recipe: ImportedRecipe; stage: ImportStage } | null) ?? null;
}

/** Stage 2, for one member: checks consent and allowance, calls Claude, records cost and credit. */
function claudeFor(db: SupabaseClient, userId: string, tzOffset: number) {
  return async (input: LlmInput): Promise<LlmOutcome> => {
    if (!process.env.ANTHROPIC_API_KEY) return { recipe: null, skipped: "This page needs Fikko AI to read it, which isn't set up yet. You can type the recipe in yourself." };
    if (await consentError(db, userId, ["ai_processing"])) {
      return { recipe: null, skipped: "This page needs Fikko AI to read it, and AI features are turned off. You can turn them on in Profile → Privacy, or type the recipe in yourself." };
    }
    const { blocked, limit } = await checkAllowance(db, userId, tzOffset);
    if (blocked === "fast") return { recipe: null, skipped: SLOW_DOWN };
    if (blocked) return { recipe: null, skipped: `This page needs Fikko AI to read it. ${limitMessage(blocked, limit)}` };
    try {
      const out = await extractWithClaude(input);
      if (out.usage) await recordCosts(db, userId, [{ feature: "recipe_import", model: MODEL, usage: out.usage }]);
      // A credit only when a recipe came back.
      if (isComplete(out.recipe)) await recordUse(db, userId);
      return out;
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) return { recipe: null, skipped: "Fikko is busy right now. Please try again in a minute." };
      log({ outcome: "llm_error", status: err instanceof Anthropic.APIError ? err.status : null });
      return { recipe: null, skipped: "We couldn't read that page just now. Please try again, or type the recipe in yourself." };
    }
  };
}

async function handlePOST(request: Request) {
  const started = Date.now();
  if (!supabaseReady()) return json({ error: "Recipe import isn't configured on the server." }, 503);

  const db = admin();
  const member = await memberFrom(request, db);
  if (!member) return json({ error: "Sign in again to continue." }, 401);
  if (!(await withinLimits(db, `recipe-import:${member.id}`, LIMITS))) return json({ error: SLOW_DOWN, code: "rate_limited" }, 429);

  const body = (await request.json().catch(() => ({}))) as { url?: unknown; tzOffset?: unknown };
  let url: URL;
  try {
    url = normalizeUrl(typeof body.url === "string" ? body.url : "");
  } catch (err) {
    const message = err instanceof InvalidUrlError ? err.message : "Paste a link to a recipe page.";
    return json({ error: message, code: "invalid_url" }, 400);
  }
  const unsupported = unsupportedSource(url);
  if (unsupported) return json({ error: unsupported, code: "unsupported_source" }, 400);
  const host = url.hostname;
  const key = sourceKey(url);

  const dupe = await existing(db, member.id, [key]);
  if (dupe) {
    log({ host, outcome: "duplicate", ms: Date.now() - started });
    return json({ duplicate: dupe });
  }

  const hit = await cached(db, key);
  let recipe: ImportedRecipe;
  let stage: ImportStage;
  let finalKey = key;
  if (hit) {
    ({ recipe, stage } = hit);
    try {
      finalKey = sourceKey(normalizeUrl(recipe.source_url));
    } catch {
      // Keep the key the member's link gave.
    }
  } else {
    try {
      const result = await runPipeline(url, { llm: claudeFor(db, member.id, clampOffset(body.tzOffset)) });
      ({ recipe, stage } = result);
      finalKey = sourceKey(result.finalUrl);
    } catch (err) {
      const failure = err instanceof ImportFailure ? err : new ImportFailure("unreachable", "We couldn't open that page. Please try again.");
      log({ host, outcome: "failed", reason: failure.code, ms: Date.now() - started });
      if (failure.code === "blocked" || failure.code === "unsupported_source") return json({ error: failure.message, code: failure.code }, 400);
      // The link itself was fine, so the member can still keep the recipe by typing it in, credited to the page.
      return json({ error: failure.message, code: failure.code, partial: failure.partial, sourceUrl: url.toString(), sourceKey: key }, 422);
    }

    const rows = [...new Set([key, finalKey])].map((k) => ({ source_key: k, stage, recipe, created_at: new Date().toISOString() }));
    const { error } = await db.from("recipe_import_cache").upsert(rows);
    if (error) log({ host, outcome: "cache_write_failed" });
  }

  // A short link or an old address can redirect to a page the member already has.
  if (finalKey !== key) {
    const redirectedDupe = await existing(db, member.id, [finalKey]);
    if (redirectedDupe) {
      log({ host, outcome: "duplicate", ms: Date.now() - started });
      return json({ duplicate: redirectedDupe });
    }
  }

  const imageData = await fetchImage(recipe.image_url);
  log({ host, outcome: "ok", stage, cached: !!hit, confidence: recipe.confidence, ms: Date.now() - started });
  return json({ recipe, stage, sourceKey: finalKey, imageData });
}

// The mobile apps call this from another origin (see _lib/cors.ts).
export const POST = withCors(handlePOST);
export { OPTIONS };

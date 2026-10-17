import { supabase } from "./supabase";
import { friendlyError } from "./errors";
import { notifyAiUsed } from "./aiCredits";
import type { ImportedRecipe, ImportStage, Ingredient } from "../../api/_lib/recipeImport/types";

// Import from URL: /api/recipe-import reads a recipe page and sends the recipe
// back for the member to check; saveImportedRecipe (aiRecipes.ts) then keeps it
// in their private library. See api/recipe-import.ts.

export type { ImportedRecipe, ImportStage, Ingredient };

export type ImportResult =
  | { kind: "recipe"; recipe: ImportedRecipe; stage: ImportStage; sourceKey: string; imageData: string | null }
  | { kind: "duplicate"; id: string; title: string };

/** Why an import failed, with whatever was found to prefill the manual form. */
export class ImportError extends Error {
  constructor(
    message: string,
    public code: string,
    public partial: Partial<ImportedRecipe> | null,
    /** Set when the link was valid, so a recipe typed in by hand can still credit the page. */
    public source: { url: string; key: string } | null = null,
  ) { super(message); }
}

export async function importRecipe(url: string): Promise<ImportResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ImportError("Sign in again to continue.", "auth", null);
  let res: Response;
  // A little longer than the server's own 60-second limit, so a stuck request still ends.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 65_000);
  try {
    res = await fetch("/api/recipe-import", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, tzOffset: new Date().getTimezoneOffset() }),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) throw new ImportError("That page took too long to read. Please try again in a moment.", "timeout", null);
    throw new ImportError(friendlyError(err, "We couldn't reach Fikko. Please try again."), "network", null);
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 504) throw new ImportError("That page took too long to read. Please try again in a moment.", "timeout", null);
  const out = (await res.json().catch(() => ({}))) as {
    recipe?: ImportedRecipe; stage?: ImportStage; sourceKey?: string; imageData?: string | null;
    duplicate?: { id: string; title: string };
    error?: string; code?: string; partial?: Partial<ImportedRecipe> | null; sourceUrl?: string;
  };
  if (out.duplicate) return { kind: "duplicate", ...out.duplicate };
  // Only a page read by Fikko AI uses a credit; refresh the counter shown elsewhere.
  if (out.stage === "llm") notifyAiUsed();
  if (!res.ok || !out.recipe || !out.stage || !out.sourceKey) {
    const source = out.sourceUrl && out.sourceKey ? { url: out.sourceUrl, key: out.sourceKey } : null;
    throw new ImportError(out.error ?? "We couldn't import that recipe. Please try again.", out.code ?? "unknown", out.partial ?? null, source);
  }
  return { kind: "recipe", recipe: out.recipe, stage: out.stage, sourceKey: out.sourceKey, imageData: out.imageData ?? null };
}

/**
 * A data: URL from the server → a Blob the photo code can resize. Decoded by
 * hand: the content security policy doesn't let fetch() read data: URLs.
 */
export function imageBlob(dataUrl: string | null): Blob | null {
  const m = dataUrl?.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
  if (!m) return null;
  try {
    const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    return new Blob([bytes], { type: m[1] });
  } catch {
    return null;
  }
}

/** How an ingredient reads back on the form: the line as the page wrote it. */
export const ingredientLine = (i: Ingredient) => i.raw_text;

/**
 * The structured ingredients for what's on the form when it's saved. Lines the
 * member left as imported keep their parsed details; edited or added lines
 * keep just their text, so nothing claims a quantity the member didn't confirm.
 */
export function detailsFor(lines: string[], imported: Ingredient[]): Ingredient[] {
  const byText = new Map(imported.map((i) => [i.raw_text, i]));
  return lines.map((line) => byText.get(line) ?? { raw_text: line, quantity: null, unit: null, name: line, notes: null, group: null });
}

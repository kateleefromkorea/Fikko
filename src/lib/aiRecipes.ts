import { supabase } from "./supabase";
import { notifyAiUsed } from "./aiCredits";
import type { Allergen } from "./preferences";
import { removeRecipePhoto, signPhotos, uploadRecipePhoto, type NewRecipe, type Recipe, type RecipeArtKey, type RecipeTag, type Swap } from "./recipes";
import type { Ingredient } from "./recipeImport";

// "Cook with what you have": /api/recipe-ideas turns the ingredients a member has
// into a few recipe ideas (one AI credit), and the ones they keep are saved to
// ai_recipes (migration 026). Those are private to the member: they show under
// Saved, never in the member feed, and earn no recipe points.
//
// Recipes imported from a web page (recipeImport.ts, migration 044) live in the
// same private library, with origin 'imported' and a credit to their source.

/** An idea fresh from the AI, before it's saved. Keys start with this. */
export const IDEA_PREFIX = "idea-";
export const isIdea = (r: Recipe) => r.key.startsWith(IDEA_PREFIX);

interface IdeaResponse {
  title: string;
  description: string;
  tags: RecipeTag[];
  contains: Allergen[];
  art: RecipeArtKey;
  minutes: number | null;
  servings: number | null;
  calories: number | null;
  macros: { protein: number; carbs: number; fat: number } | null;
  ingredients: string[];
  have: string[];
  buy: string[];
  swaps: Swap[];
  steps: string[];
}

export interface IdeaRequest {
  ingredients: string[];
  /** The member has salt, pepper, oil and the like. */
  pantry: boolean;
  tags: RecipeTag[];
  diets: string[];
  allergies: string[];
}

/** Asks for recipe ideas. Uses one AI credit when ideas come back. */
export async function generateIdeas(req: IdeaRequest): Promise<Recipe[]> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in again to continue.");
  const res = await fetch("/api/recipe-ideas", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...req, tzOffset: new Date().getTimezoneOffset() }),
  });
  const out = (await res.json().catch(() => ({}))) as { recipes?: IdeaResponse[]; error?: string };
  notifyAiUsed();
  if (!res.ok || !out.recipes) throw new Error(out.error ?? "We couldn't come up with recipes. Please try again.");
  const batch = Date.now().toString(36);
  return out.recipes.map((r, i) => ({
    key: `${IDEA_PREFIX}${batch}-${i}`,
    source: "ai",
    title: r.title,
    description: r.description,
    tags: r.tags,
    contains: r.contains,
    art: r.art,
    minutes: r.minutes,
    servings: r.servings,
    calories: r.calories,
    macros: r.macros ?? undefined,
    ingredients: r.ingredients,
    have: r.have,
    buy: r.buy,
    swaps: r.swaps,
    steps: r.steps,
  }));
}

const BASE_COLUMNS = "id, title, description, tags, contains, art, ingredients, have, buy, swaps, steps, minutes, servings, calories, protein, carbs, fat, created_at";
const IMPORT_COLUMNS = "origin, source_url, source_site, source_author, photo_path, language";
const COLUMNS = `${BASE_COLUMNS}, ${IMPORT_COLUMNS}`;

interface AiRecipeRow {
  id: string;
  title: string;
  description: string;
  tags: RecipeTag[];
  contains: Allergen[] | null;
  art: RecipeArtKey | null;
  ingredients: string[];
  have: string[];
  buy: string[];
  swaps: { instead_of: string; use: string }[];
  steps: string[];
  minutes: number | null;
  servings: number | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  created_at: string;
  // Migration 044; absent before it has run.
  origin?: "ai" | "imported";
  source_url?: string | null;
  source_site?: string | null;
  source_author?: string | null;
  photo_path?: string | null;
  language?: string | null;
}

function toRecipe(r: AiRecipeRow, photoUrl: string | null = null): Recipe {
  const imported = r.origin === "imported";
  return {
    key: r.id,
    source: "ai",
    origin: r.origin ?? "ai",
    sourceUrl: r.source_url ?? null,
    sourceSite: r.source_site ?? null,
    sourceAuthor: r.source_author ?? null,
    language: r.language ?? null,
    photoPath: r.photo_path ?? null,
    photoUrl,
    title: r.title,
    description: r.description,
    tags: r.tags ?? [],
    // Imported recipes may not list allergens (null); AI ones always do.
    contains: imported ? r.contains : r.contains ?? [],
    art: r.art ?? "bowl",
    ingredients: r.ingredients,
    have: r.have ?? [],
    buy: r.buy ?? [],
    swaps: (r.swaps ?? []).map((s) => ({ insteadOf: s.instead_of, use: s.use })),
    steps: r.steps,
    minutes: r.minutes,
    servings: r.servings,
    calories: r.calories,
    // numeric columns come back as strings.
    macros: r.protein != null && r.carbs != null && r.fat != null
      ? { protein: Number(r.protein), carbs: Number(r.carbs), fat: Number(r.fat) }
      : undefined,
    createdAt: r.created_at,
  };
}

async function withPhotos(rows: AiRecipeRow[]): Promise<Recipe[]> {
  const urls = await signPhotos(rows.map((r) => r.photo_path).filter((p): p is string => !!p));
  return rows.map((r) => toRecipe(r, r.photo_path ? urls.get(r.photo_path) ?? null : null));
}

/** The member's private library (AI and imported recipes), newest first. */
export async function fetchAiRecipes(): Promise<Recipe[]> {
  const query = (columns: string) => supabase.from("ai_recipes").select(columns).order("created_at", { ascending: false });
  let { data, error } = await query(COLUMNS);
  // 42703: migration 044 hasn't run yet, so read the columns that exist.
  if (error?.code === "42703") ({ data, error } = await query(BASE_COLUMNS));
  if (error) throw new Error("Couldn't load your AI recipes.");
  return withPhotos((data ?? []) as unknown as AiRecipeRow[]);
}

export async function saveAiRecipe(idea: Recipe): Promise<Recipe> {
  const { data, error } = await supabase
    .from("ai_recipes")
    .insert({
      title: idea.title,
      description: idea.description,
      tags: idea.tags,
      contains: idea.contains ?? [],
      art: idea.art ?? null,
      ingredients: idea.ingredients,
      have: idea.have ?? [],
      buy: idea.buy ?? [],
      swaps: (idea.swaps ?? []).map((s) => ({ instead_of: s.insteadOf, use: s.use })),
      steps: idea.steps,
      minutes: idea.minutes,
      servings: idea.servings,
      calories: idea.calories,
      protein: idea.macros?.protein ?? null,
      carbs: idea.macros?.carbs ?? null,
      fat: idea.macros?.fat ?? null,
    })
    .select(BASE_COLUMNS)
    .single();
  // 42P01: migration 026 hasn't been run yet.
  if (error?.code === "42P01") throw new Error("Saving AI recipes isn't switched on yet. Please try again later.");
  if (error) throw new Error("Couldn't save this recipe. Please try again.");
  return toRecipe(data as unknown as AiRecipeRow);
}

export async function deleteAiRecipe(recipe: Recipe) {
  const { error } = await supabase.from("ai_recipes").delete().eq("id", recipe.key);
  if (error) throw new Error("Couldn't remove the recipe.");
  if (recipe.photoPath) await removeRecipePhoto(recipe.photoPath);
}

/** An imported recipe as the member confirmed it on the review form. */
export interface ImportToSave {
  recipe: NewRecipe;
  sourceUrl: string;
  sourceKey: string;
  sourceSite: string;
  sourceAuthor: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  language: string | null;
  macros: { protein: number; carbs: number; fat: number } | null;
  ingredientDetails: Ingredient[];
}

/** Saves an imported recipe to the member's private library, with its photo if any. */
export async function saveImportedRecipe(userId: string, input: ImportToSave, photo: Blob | null): Promise<Recipe> {
  const photoPath = photo ? await uploadRecipePhoto(userId, photo) : null;
  const r = input.recipe;
  const { data, error } = await supabase
    .from("ai_recipes")
    .insert({
      origin: "imported",
      title: r.title.trim(),
      description: r.description.trim(),
      tags: r.tags,
      contains: r.contains,
      ingredients: r.ingredients,
      steps: r.steps,
      minutes: r.minutes,
      servings: r.servings,
      calories: r.calories,
      protein: input.macros?.protein ?? null,
      carbs: input.macros?.carbs ?? null,
      fat: input.macros?.fat ?? null,
      source_url: input.sourceUrl,
      source_key: input.sourceKey,
      source_site: input.sourceSite,
      source_author: input.sourceAuthor,
      prep_minutes: input.prepMinutes,
      cook_minutes: input.cookMinutes,
      language: input.language,
      ingredient_details: input.ingredientDetails,
      photo_path: photoPath,
    })
    .select(COLUMNS)
    .single();
  if (error) {
    if (photoPath) await removeRecipePhoto(photoPath);
    // 42703: migration 044 hasn't run yet.
    if (error.code === "42703") throw new Error("Importing recipes isn't switched on yet. Please try again later.");
    if (error.code === "23505") throw new Error("This recipe is already in your library.");
    if (error.code === "23514") throw new Error("Something in the recipe is too long or missing. Check it and try again.");
    throw new Error("Couldn't save this recipe. Please try again.");
  }
  return (await withPhotos([data as unknown as AiRecipeRow]))[0];
}

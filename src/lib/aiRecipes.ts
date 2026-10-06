import { supabase } from "./supabase";
import { notifyAiUsed } from "./aiCredits";
import type { Allergen } from "./preferences";
import type { Recipe, RecipeArtKey, RecipeTag, Swap } from "./recipes";

// "Cook with what you have": /api/recipe-ideas turns the ingredients a member has
// into a few recipe ideas (one AI credit), and the ones they keep are saved to
// ai_recipes (migration 026). Those are private to the member: they show under
// Saved, never in the member feed, and earn no recipe points.

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
  if (!res.ok || !out.recipes) throw new Error(out.error ?? "Something went wrong. Please try again.");
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

const COLUMNS = "id, title, description, tags, contains, art, ingredients, have, buy, swaps, steps, minutes, servings, calories, protein, carbs, fat, created_at";

interface AiRecipeRow {
  id: string;
  title: string;
  description: string;
  tags: RecipeTag[];
  contains: Allergen[];
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
}

function toRecipe(r: AiRecipeRow): Recipe {
  return {
    key: r.id,
    source: "ai",
    title: r.title,
    description: r.description,
    tags: r.tags ?? [],
    contains: r.contains ?? [],
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

/** The member's saved AI recipes, newest first. */
export async function fetchAiRecipes(): Promise<Recipe[]> {
  const { data, error } = await supabase.from("ai_recipes").select(COLUMNS).order("created_at", { ascending: false });
  if (error) throw new Error("Couldn't load your AI recipes.");
  return ((data ?? []) as AiRecipeRow[]).map(toRecipe);
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
    .select(COLUMNS)
    .single();
  // 42P01: migration 026 hasn't been run yet.
  if (error?.code === "42P01") throw new Error("Saving AI recipes isn't switched on yet. Please try again later.");
  if (error) throw new Error("Couldn't save this recipe. Please try again.");
  return toRecipe(data as AiRecipeRow);
}

export async function deleteAiRecipe(id: string) {
  const { error } = await supabase.from("ai_recipes").delete().eq("id", id);
  if (error) throw new Error("Couldn't remove the recipe.");
}

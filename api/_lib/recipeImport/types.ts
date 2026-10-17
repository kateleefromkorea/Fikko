// The shape every import source produces, whichever way it found the recipe.
// It maps onto the member's private library (ai_recipes, migration 044) and
// is what the review form starts from.

import type { Ingredient } from "./ingredients.js";

export type { Ingredient };

/** Which stage of the pipeline found the recipe. */
export type ImportStage = "json_ld" | "microdata" | "llm";

export interface ImportedRecipe {
  title: string;
  description: string;
  source_url: string;
  source_site: string;
  author: string | null;
  image_url: string | null;
  servings: number | null;
  prep_time_min: number | null;
  cook_time_min: number | null;
  /** Total time; falls back to prep + cook. The library's single "Time" field. */
  total_time_min: number | null;
  ingredients: Ingredient[];
  steps: string[];
  /** Only Fikko's own tags (src/lib/recipes.ts RecipeTag), so filters and diet checks work. */
  tags: string[];
  /** Per serving, as the page gives it. */
  nutrition: { calories: number | null; protein: number | null; carbs: number | null; fat: number | null } | null;
  /** BCP 47 code ("en", "ja", "ko"), or null when unknown. */
  language: string | null;
  /** 0 to 1: how sure we are the recipe is complete and correct. */
  confidence: number;
  /** Fields the page didn't give, so the review form can point them out. */
  missing_fields: string[];
}

/** What a page gave us: a recipe, and/or what's needed to try the next stage. */
export interface PageExtraction {
  recipe: ImportedRecipe | null;
  stage: ImportStage | null;
  /** Page title, description and image from meta tags, for prefilling when no recipe was found. */
  meta: { title: string | null; description: string | null; image_url: string | null; site_name: string | null; language: string | null };
}

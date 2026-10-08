import { supabase } from "./supabase";
import type { Allergen } from "./preferences";

// Recipes come from two places: Fikko's own set, shipped in the app
// (recipeCatalog.ts), and recipes members share, stored in Supabase
// (migration 008). Both are shown through the same Recipe shape.

export type RecipeTag =
  | "chicken" | "beef" | "pork" | "fish" | "eggs" | "vegetarian" | "vegan"
  | "low-fat" | "high-protein" | "low-carb" | "quick" | "breakfast";

/** Filter chips, in the order they appear. Must match the list in migration 008. */
export const RECIPE_TAGS: { key: RecipeTag; label: string }[] = [
  { key: "chicken", label: "Chicken" },
  { key: "beef", label: "Beef" },
  { key: "pork", label: "Pork" },
  { key: "fish", label: "Fish & seafood" },
  { key: "eggs", label: "Eggs" },
  { key: "vegetarian", label: "Vegetarian" },
  { key: "vegan", label: "Vegan" },
  { key: "low-fat", label: "Low-fat" },
  { key: "high-protein", label: "High-protein" },
  { key: "low-carb", label: "Low-carb" },
  { key: "quick", label: "Under 20 min" },
  { key: "breakfast", label: "Breakfast" },
];

export const tagLabel = (key: RecipeTag) => RECIPE_TAGS.find((t) => t.key === key)?.label ?? key;

/** Illustration styles for recipes without a photo. See RecipeArt. */
export type RecipeArtKey =
  | "chicken" | "wrap" | "curry" | "beef" | "stew" | "salad" | "pork" | "noodles" | "fish" | "taco" | "shrimp"
  | "egg" | "egg-pan" | "oats" | "cherry" | "stew-green" | "pasta" | "tofu" | "bowl" | "veg" | "pancake";

export interface Macros { protein: number; carbs: number; fat: number }

export interface CatalogRecipe {
  key: string;
  title: string;
  description: string;
  tags: RecipeTag[];
  /** Allergens in the ingredients. */
  contains: Allergen[];
  art: RecipeArtKey;
  minutes: number;
  servings: number;
  /** Per serving, approximate. */
  calories: number;
  macros: Macros;
  ingredients: string[];
  steps: string[];
}

export interface Recipe {
  /** Catalogue id, or a member recipe's uuid. Also the key for saves. */
  key: string;
  /** "ai": the member's own AI recipe, private to them (see aiRecipes.ts). */
  source: "fikko" | "member" | "ai";
  title: string;
  description: string;
  tags: RecipeTag[];
  /** Allergens it contains, or null when the author didn't say. */
  contains: Allergen[] | null;
  ingredients: string[];
  steps: string[];
  minutes: number | null;
  servings: number | null;
  calories: number | null;
  macros?: Macros;
  art?: RecipeArtKey;
  photoPath?: string | null;
  /** Short-lived signed link to the photo. */
  photoUrl?: string | null;
  /** Member recipes: how many other members have saved it. */
  saves?: number;
  userId?: string;
  authorName?: string;
  createdAt?: string;
  /**
   * Member recipes: new ones wait for an admin before other members see them
   * (migration 033). Only the author ever sees a pending or rejected recipe.
   */
  review?: ReviewStatus;
  /** Why it wasn't approved, when the admin said. */
  reviewNote?: string | null;
  /** AI recipes: what the member had, what to buy, and substitutions. */
  have?: string[];
  buy?: string[];
  swaps?: Swap[];
}

export type ReviewStatus = "pending" | "approved" | "rejected";

export interface Swap { insteadOf: string; use: string }

// Photos for Fikko's recipes: drop an image into src/assets/recipes/ named
// after the recipe's key (e.g. fikko-lemon-herb-chicken.jpg) and it's picked
// up at build time. Recipes without one keep their illustrated tile.
const CATALOG_PHOTOS = new Map(
  Object.entries(
    import.meta.glob<string>("../assets/recipes/*.{jpg,jpeg,png,webp}", { eager: true, query: "?url", import: "default" }),
  ).map(([path, url]) => [path.split("/").pop()!.replace(/\.[^.]+$/, ""), url]),
);

export const fromCatalog = (c: CatalogRecipe): Recipe => ({
  ...c,
  source: "fikko",
  photoUrl: CATALOG_PHOTOS.get(c.key) ?? null,
});

export const LIMITS = { title: 80, description: 300, ingredients: 40, steps: 30 };

const BUCKET = "recipe-photos";
const COLUMNS = "id, user_id, author_name, title, description, tags, ingredients, steps, minutes, servings, calories, photo_path, save_count, contains, created_at, review_status, review_note";
// Signed photo links last long enough for a browsing session; a reload renews them.
const PHOTO_LINK_SECONDS = 60 * 60 * 6;
// Member recipes shown at once. Plenty for now; add paging when it's outgrown.
const MEMBER_LIMIT = 200;

interface RecipeRow {
  id: string;
  user_id: string;
  author_name: string;
  title: string;
  description: string;
  tags: RecipeTag[];
  ingredients: string[];
  steps: string[];
  minutes: number | null;
  servings: number | null;
  calories: number | null;
  photo_path: string | null;
  save_count: number;
  contains: Allergen[] | null;
  created_at: string;
  review_status: ReviewStatus;
  review_note: string | null;
}

function toRecipe(r: RecipeRow, photoUrl: string | null = null): Recipe {
  return {
    key: r.id,
    source: "member",
    title: r.title,
    description: r.description,
    tags: r.tags ?? [],
    contains: r.contains ?? null,
    ingredients: r.ingredients,
    steps: r.steps,
    minutes: r.minutes,
    servings: r.servings,
    calories: r.calories,
    photoPath: r.photo_path,
    photoUrl,
    saves: r.save_count ?? 0,
    userId: r.user_id,
    authorName: r.author_name,
    createdAt: r.created_at,
    review: r.review_status,
    reviewNote: r.review_note,
  };
}

/** Database errors carry technical text; show members something readable. */
function friendly(error: { message: string; code?: string }, fallback: string) {
  if (error.code === "P0001") return new Error(error.message);
  if (error.code === "23514") return new Error("Something in the recipe is too long or missing. Check it and try again.");
  return new Error(fallback);
}

async function signPhotos(paths: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (!paths.length) return urls;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, PHOTO_LINK_SECONDS);
  for (const d of data ?? []) if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
  return urls;
}

/** Recipes members have shared, newest first, with photo links. */
export async function fetchMemberRecipes(): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from("recipes")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(MEMBER_LIMIT);
  if (error) throw friendly(error, "Couldn't load member recipes.");
  const rows = (data ?? []) as RecipeRow[];
  const urls = await signPhotos(rows.map((r) => r.photo_path).filter((p): p is string => !!p));
  return rows.map((r) => toRecipe(r, r.photo_path ? urls.get(r.photo_path) ?? null : null));
}

export async function fetchSavedKeys(): Promise<Set<string>> {
  const { data, error } = await supabase.from("recipe_saves").select("recipe_key");
  if (error) throw friendly(error, "Couldn't load your saved recipes.");
  return new Set((data ?? []).map((r) => r.recipe_key as string));
}

export async function setSaved(userId: string, key: string, saved: boolean) {
  const { error } = saved
    ? await supabase.from("recipe_saves").insert({ recipe_key: key })
    : await supabase.from("recipe_saves").delete().eq("user_id", userId).eq("recipe_key", key);
  // 23505: already saved (e.g. a double tap). The end state is the same.
  if (error && error.code !== "23505") throw friendly(error, "Couldn't update your saved recipes.");
}

/**
 * Shrinks a photo to at most 1600px on its longest side and re-encodes it as
 * JPEG. Keeps uploads small and strips location data from phone photos.
 */
export async function preparePhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that photo."))), "image/jpeg", 0.85),
  );
}

export interface NewRecipe {
  title: string;
  description: string;
  tags: RecipeTag[];
  contains: Allergen[] | null;
  ingredients: string[];
  steps: string[];
  minutes: number | null;
  servings: number | null;
  calories: number | null;
}

/** Uploads the photo (if any) into the member's own folder, then saves the recipe. */
export async function createRecipe(userId: string, input: NewRecipe, photo?: Blob | null): Promise<Recipe> {
  let photoPath: string | null = null;
  if (photo) {
    photoPath = `${userId}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from(BUCKET).upload(photoPath, photo, { contentType: "image/jpeg" });
    if (error) throw new Error("Couldn't upload the photo. Try a smaller image, or share without one.");
  }

  const { data, error } = await supabase
    .from("recipes")
    .insert({
      title: input.title.trim(),
      description: input.description.trim(),
      tags: input.tags,
      contains: input.contains,
      ingredients: input.ingredients,
      steps: input.steps,
      minutes: input.minutes,
      servings: input.servings,
      calories: input.calories,
      photo_path: photoPath,
    })
    .select(COLUMNS)
    .single();

  if (error) {
    // Don't leave an orphaned photo behind.
    if (photoPath) await supabase.storage.from(BUCKET).remove([photoPath]);
    throw friendly(error, "Couldn't share your recipe. Please try again.");
  }
  const urls = await signPhotos(photoPath ? [photoPath] : []);
  return toRecipe(data as RecipeRow, photoPath ? urls.get(photoPath) ?? null : null);
}

export async function deleteRecipe(recipe: Recipe) {
  const { error } = await supabase.from("recipes").delete().eq("id", recipe.key);
  if (error) throw friendly(error, "Couldn't delete the recipe.");
  if (recipe.photoPath) await supabase.storage.from(BUCKET).remove([recipe.photoPath]);
}

/** Files a report. Resolves true if this member had already reported it. */
export async function reportRecipe(recipeId: string, reason?: string) {
  const { error } = await supabase.from("recipe_reports").insert({ recipe_id: recipeId, reason: reason?.trim() || null });
  if (error?.code === "23505") return true;
  if (error) throw friendly(error, "Couldn't send your report.");
  return false;
}

import { Award, ChefHat, Crown, Heart, Sparkles, type LucideIcon } from "lucide-react";
import { supabase } from "./supabase";

// Points and badges for sharing recipes (migration 009). The database awards
// every point; this file only reads them and works out badges.

export const POINT_RULES = [
  { points: 5, text: "each time another member saves one of your recipes" },
  { points: 5, text: "bonus when a recipe with a photo, calories and two or more tags gets its first save" },
  { points: 25, text: "when your recipe is the featured recipe of the week" },
];

export interface PointsEvent {
  id: string;
  kind: "recipe_save" | "recipe_complete" | "recipe_featured";
  points: number;
  recipeId: string | null;
  createdAt: string;
}

export interface Rewards {
  points: number;
  recent: PointsEvent[];
  recipesShared: number;
  /** Saves by other members across all of this member's recipes. */
  totalSaves: number;
  /** The most saves any one of their recipes has. */
  topSaves: number;
  timesFeatured: number;
}

export const EMPTY_REWARDS: Rewards = { points: 0, recent: [], recipesShared: 0, totalSaves: 0, topSaves: 0, timesFeatured: 0 };

export interface Badge {
  key: string;
  label: string;
  how: string;
  icon: LucideIcon;
  /** Progress towards the badge: current and goal. */
  progress: (r: Rewards) => [number, number];
}

export const BADGES: Badge[] = [
  { key: "first-recipe", label: "First recipe", how: "Share your first recipe", icon: Sparkles, progress: (r) => [r.recipesShared, 1] },
  { key: "home-cook", label: "Home cook", how: "Share 5 recipes", icon: ChefHat, progress: (r) => [r.recipesShared, 5] },
  { key: "crowd-pleaser", label: "Crowd pleaser", how: "Get 10 saves across your recipes", icon: Heart, progress: (r) => [r.totalSaves, 10] },
  { key: "fan-favourite", label: "Fan favourite", how: "Get 25 saves on a single recipe", icon: Award, progress: (r) => [r.topSaves, 25] },
  { key: "featured-chef", label: "Featured chef", how: "Have a recipe featured of the week", icon: Crown, progress: (r) => [r.timesFeatured, 1] },
];

export const earned = (b: Badge, r: Rewards) => {
  const [have, goal] = b.progress(r);
  return have >= goal;
};

export async function fetchRewards(userId: string): Promise<Rewards> {
  const [events, recipes] = await Promise.all([
    supabase
      .from("points_events")
      .select("id, kind, points, recipe_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("recipes").select("save_count").eq("user_id", userId),
  ]);
  if (events.error || recipes.error) throw new Error("Couldn't load your rewards.");

  const rows = events.data ?? [];
  const counts = (recipes.data ?? []).map((r) => r.save_count as number);
  return {
    points: rows.reduce((s, e) => s + e.points, 0),
    recent: rows.slice(0, 5).map((e) => ({
      id: e.id, kind: e.kind, points: e.points, recipeId: e.recipe_id, createdAt: e.created_at,
    })),
    recipesShared: counts.length,
    totalSaves: counts.reduce((s, n) => s + n, 0),
    topSaves: counts.length ? Math.max(...counts) : 0,
    timesFeatured: rows.filter((e) => e.kind === "recipe_featured").length,
  };
}

/** This week's featured member recipe, or null when there isn't one. */
export async function fetchFeatured(): Promise<{ recipeId: string; saves: number } | null> {
  const { data, error } = await supabase.rpc("current_featured_recipe");
  if (error || !data?.length) return null;
  return { recipeId: data[0].recipe_id, saves: data[0].saves };
}

export const EVENT_LABEL: Record<PointsEvent["kind"], string> = {
  recipe_save: "A member saved your recipe",
  recipe_complete: "Complete-recipe bonus",
  recipe_featured: "Featured recipe of the week",
};

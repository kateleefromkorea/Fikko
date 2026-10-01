import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../lib/recipes";
import type { NewRecipe, Recipe } from "../lib/recipes";
import { RECIPE_CATALOG } from "../lib/recipeCatalog";
import { EMPTY_REWARDS, fetchFeatured, fetchRewards, type Rewards } from "../lib/rewards";

const CATALOG = RECIPE_CATALOG.map(api.fromCatalog);

/**
 * Every recipe a member can browse: Fikko's own set plus what members have
 * shared, and which of them this member has saved. Fikko's recipes show
 * straight away; member recipes join them once loaded. Saves update on
 * screen immediately and roll back if the server refuses. Also loads the
 * member's points and badges, and this week's featured recipe.
 */
export function useRecipes(userId: string) {
  const [memberRecipes, setMemberRecipes] = useState<Recipe[]>([]);
  const [saved, setSavedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rewards, setRewards] = useState<Rewards>(EMPTY_REWARDS);
  const [featured, setFeatured] = useState<{ recipeId: string; saves: number } | null>(null);

  const refreshRewards = useCallback(async () => {
    try {
      setRewards(await fetchRewards(userId));
    } catch {
      // Rewards are a bonus; the page works without them.
    }
  }, [userId]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [members, saves, feat] = await Promise.allSettled([api.fetchMemberRecipes(), api.fetchSavedKeys(), fetchFeatured()]);
    if (members.status === "fulfilled") setMemberRecipes(members.value);
    else setError(members.reason.message);
    if (saves.status === "fulfilled") setSavedKeys(saves.value);
    if (feat.status === "fulfilled") setFeatured(feat.value);
    setLoading(false);
    void refreshRewards();
  }, [refreshRewards]);

  useEffect(() => {
    void reload();
  }, [reload, userId]);

  // Member recipes first (newest), then Fikko's set.
  const recipes = useMemo(() => [...memberRecipes, ...CATALOG], [memberRecipes]);

  async function toggleSave(recipe: Recipe) {
    const on = !saved.has(recipe.key);
    const flip = (value: boolean) =>
      setSavedKeys((prev) => {
        const next = new Set(prev);
        if (value) next.add(recipe.key);
        else next.delete(recipe.key);
        return next;
      });
    // Saving someone else's recipe adds to its count; saving your own doesn't.
    const counts = recipe.source === "member" && recipe.userId !== userId;
    const bump = (delta: number) =>
      counts && setMemberRecipes((prev) => prev.map((r) => (r.key === recipe.key ? { ...r, saves: Math.max(0, (r.saves ?? 0) + delta) } : r)));
    flip(on);
    bump(on ? 1 : -1);
    try {
      await api.setSaved(userId, recipe.key, on);
    } catch (err) {
      flip(!on);
      bump(on ? -1 : 1);
      setError((err as Error).message);
    }
  }

  /** Throws with a readable message on failure, so the form can show it. */
  async function create(input: NewRecipe, photo?: Blob | null) {
    const recipe = await api.createRecipe(userId, input, photo);
    setMemberRecipes((prev) => [recipe, ...prev]);
    void refreshRewards();
    return recipe;
  }

  async function remove(recipe: Recipe) {
    await api.deleteRecipe(recipe);
    setMemberRecipes((prev) => prev.filter((r) => r.key !== recipe.key));
    void refreshRewards();
  }

  /** Reports a recipe and hides it from this member straight away. */
  async function report(recipe: Recipe, reason?: string) {
    await api.reportRecipe(recipe.key, reason);
    setMemberRecipes((prev) => prev.filter((r) => r.key !== recipe.key));
  }

  return { recipes, saved, loading, error, setError, reload, toggleSave, create, remove, report, rewards, featured };
}

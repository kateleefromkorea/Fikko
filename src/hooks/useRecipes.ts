import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../lib/recipes";
import type { NewRecipe, Recipe } from "../lib/recipes";
import { RECIPE_CATALOG } from "../lib/recipeCatalog";

const CATALOG = RECIPE_CATALOG.map(api.fromCatalog);

/**
 * Every recipe a member can browse: Fikko's own set plus what members have
 * shared, and which of them this member has saved. Fikko's recipes show
 * straight away; member recipes join them once loaded. Saves update on
 * screen immediately and roll back if the server refuses.
 */
export function useRecipes(userId: string) {
  const [memberRecipes, setMemberRecipes] = useState<Recipe[]>([]);
  const [saved, setSavedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [members, saves] = await Promise.allSettled([api.fetchMemberRecipes(), api.fetchSavedKeys()]);
    if (members.status === "fulfilled") setMemberRecipes(members.value);
    else setError(members.reason.message);
    if (saves.status === "fulfilled") setSavedKeys(saves.value);
    setLoading(false);
  }, []);

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
    flip(on);
    try {
      await api.setSaved(userId, recipe.key, on);
    } catch (err) {
      flip(!on);
      setError((err as Error).message);
    }
  }

  /** Throws with a readable message on failure, so the form can show it. */
  async function create(input: NewRecipe, photo?: Blob | null) {
    const recipe = await api.createRecipe(userId, input, photo);
    setMemberRecipes((prev) => [recipe, ...prev]);
    return recipe;
  }

  async function remove(recipe: Recipe) {
    await api.deleteRecipe(recipe);
    setMemberRecipes((prev) => prev.filter((r) => r.key !== recipe.key));
  }

  /** Reports a recipe and hides it from this member straight away. */
  async function report(recipe: Recipe, reason?: string) {
    await api.reportRecipe(recipe.key, reason);
    setMemberRecipes((prev) => prev.filter((r) => r.key !== recipe.key));
  }

  return { recipes, saved, loading, error, setError, reload, toggleSave, create, remove, report };
}

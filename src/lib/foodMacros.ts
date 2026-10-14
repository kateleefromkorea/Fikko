import { supabase } from "./supabase";

// "Estimate with AI" under the macro bars: asks /api/food-macros to fill in protein, carbs
// and fat for foods saved without them (see api/food-macros.ts): the food log, My foods
// and the foods inside saved meals.

export interface MacroFill { updated: number; remaining: number }

/** Fired after a fill, so My foods and saved meals reload and offer the new figures. */
export const SAVED_FOODS_CHANGED = "fikko:saved-foods-changed";

export async function estimateMissingMacros(): Promise<MacroFill> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in again to continue.");
  const res = await fetch("/api/food-macros", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  const out = (await res.json().catch(() => ({}))) as Partial<MacroFill> & { error?: string };
  if (!res.ok) throw new Error(out.error ?? "That didn't work. Please try again.");
  window.dispatchEvent(new Event(SAVED_FOODS_CHANGED));
  return { updated: out.updated ?? 0, remaining: out.remaining ?? 0 };
}

/** How many saved foods (My foods, and foods inside saved meals) have no macro figures at all. 0 if it can't be read. */
export async function countSavedMissing(): Promise<number> {
  const [custom, meals] = await Promise.all([
    supabase.from("custom_foods").select("id", { count: "exact", head: true })
      .is("protein_per_100g", null).is("carbs_per_100g", null).is("fat_per_100g", null),
    supabase.from("saved_meals").select("items").limit(100),
  ]);
  let n = custom.count ?? 0;
  for (const m of (meals.data ?? []) as { items: Record<string, unknown>[] }[]) {
    for (const i of Array.isArray(m.items) ? m.items : []) {
      if (i && i.proteinPer100g == null && i.carbsPer100g == null && i.fatPer100g == null) n++;
    }
  }
  return n;
}
